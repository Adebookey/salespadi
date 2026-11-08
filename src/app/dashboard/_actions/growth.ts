"use server";
import { revalidatePath } from "next/cache";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs";
import { weeklyReportText } from "@/lib/services/reports";
import { alertVendor } from "@/lib/services/notify";
import type { ActionState } from "./vendor";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (vendorId: string) => revalidatePath(`/dashboard/v/${vendorId}/growth`);

export async function addCommentTrigger(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const keyword = str(f, "keyword");
  const reply = str(f, "reply_text");
  if (!keyword || !reply) return { error: "Keyword and reply are both needed" };
  const { error } = await supabase.from("comment_triggers").insert({
    vendor_id: vendorId, keyword, reply_text: reply, media_id: str(f, "media_id") || null,
  });
  done(vendorId);
  return error ? { error: error.message } : { ok: true, message: "Trigger added" };
}

export async function deleteCommentTrigger(vendorId: string, id: string) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("comment_triggers").delete().eq("id", id).eq("vendor_id", vendorId);
  done(vendorId);
}

export async function createBroadcast(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase, user } = await getVendorForUser(vendorId);
  const message = str(f, "message");
  if (message.length < 5) return { error: "Write the message first" };
  const { data, error } = await supabase.from("broadcasts").insert({
    vendor_id: vendorId, message, template_name: str(f, "template_name") || null, created_by: user.id,
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Could not save" };
  await enqueue("broadcast.send", { broadcastId: data.id }, { dedupeKey: `once:broadcast:${data.id}` });
  done(vendorId);
  return { ok: true, message: "Broadcast queued. Only customers who opted in will receive it." };
}

export async function setFollowups(vendorId: string, enabled: boolean) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("vendor_settings").update({ followup_enabled: enabled }).eq("vendor_id", vendorId);
  done(vendorId);
}

export async function sendWeeklyReportNow(vendorId: string, _state?: ActionState, _f?: FormData): Promise<ActionState> {
  const { vendor } = await getVendorForUser(vendorId);
  const db = adminClient();
  const sent = await alertVendor(db, vendorId, await weeklyReportText(db, vendor));
  return sent ? { ok: true, message: "Sent to the vendor's WhatsApp" } : { error: "Couldn't send: check the owner's WhatsApp number and the platform WhatsApp settings." };
}
