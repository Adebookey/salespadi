"use server";
import { revalidatePath } from "next/cache";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { sendToConversation, WindowClosedError } from "@/lib/services/messaging";
import { enqueue } from "@/lib/jobs";
import { audit } from "@/lib/services/notify";
import type { ActionState } from "./vendor";

async function ownConversation(vendorId: string, conversationId: string) {
  const { supabase, user } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("conversations").select("id").eq("id", conversationId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) throw new Error("Conversation not found");
  return { supabase, user };
}

/** A person replies: the AI steps back for this chat until someone hands it back. */
export async function sendHumanReply(vendorId: string, conversationId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user } = await ownConversation(vendorId, conversationId);
  const text = String(f.get("text") ?? "").trim();
  if (!text) return { error: "Type a message" };
  await supabase.from("conversations").update({ status: "human", needs_attention: false }).eq("id", conversationId);
  try {
    await sendToConversation(adminClient(), conversationId, [{ kind: "text", text }], {
      sender: "human", templateFallback: f.get("use_template") === "on", aiMeta: { by: user.id },
    });
  } catch (e) {
    if (e instanceof WindowClosedError) {
      return { error: "This customer last wrote more than 24 hours ago. WhatsApp only allows an approved template now: tick 'Send as template' and try again." };
    }
    return { error: e instanceof Error ? e.message : "Send failed" };
  }
  revalidatePath(`/dashboard/v/${vendorId}/inbox/${conversationId}`);
  return { ok: true };
}

export async function setConversationStatus(vendorId: string, conversationId: string, status: "ai" | "human" | "closed") {
  const { supabase, user } = await ownConversation(vendorId, conversationId);
  await supabase.from("conversations").update({
    status, needs_attention: status === "human" ? undefined : false, handoff_reason: status === "ai" ? null : undefined,
  }).eq("id", conversationId);
  await audit(adminClient(), vendorId, "conversation_status", "conversation", conversationId, { status }, user.id);
  if (status === "ai") {
    // Answer anything the customer sent while a person had the chat.
    await enqueue("ai.reply", { conversationId }, { dedupeKey: `slot:ai:${conversationId}` });
  }
  revalidatePath(`/dashboard/v/${vendorId}/inbox`, "layout");
  revalidatePath("/dashboard/escalations");
}

export async function markResolved(vendorId: string, conversationId: string) {
  const { supabase } = await ownConversation(vendorId, conversationId);
  await supabase.from("conversations").update({ needs_attention: false }).eq("id", conversationId);
  revalidatePath(`/dashboard/v/${vendorId}/inbox`, "layout");
  revalidatePath("/dashboard/escalations");
}
