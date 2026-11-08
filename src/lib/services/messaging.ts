// Sends messages to customers on the right channel, respects the 24-hour window, and logs every send.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../channels/whatsapp";
import { sendInstagram } from "../channels/instagram";
import type { OutboundMessage } from "../channels/types";
import type { Channel, Conversation, Customer } from "../types";
import { channelToken } from "./vendor";
import { env } from "../env";

const DAY_MS = 24 * 60 * 60 * 1000;

export class WindowClosedError extends Error {
  constructor(channel: string) {
    super(`The 24-hour ${channel} messaging window is closed for this customer. Only an approved template can be sent.`);
  }
}

export function windowOpen(lastInboundAt: string | null | undefined, now = Date.now()) {
  return Boolean(lastInboundAt && now - new Date(lastInboundAt).getTime() < DAY_MS);
}

export interface SendOptions {
  sender: "ai" | "human" | "system";
  /** Outside the WhatsApp window, wrap text in the approved follow-up template instead of failing. */
  templateFallback?: boolean;
  aiMeta?: Record<string, unknown>;
}

async function load(db: SupabaseClient, conversationId: string) {
  const { data, error } = await db
    .from("conversations")
    .select("*, customer:customers(*), channel:channels(*)")
    .eq("id", conversationId)
    .single();
  if (error || !data) throw new Error(`Conversation ${conversationId} not found: ${error?.message}`);
  return data as Conversation & { customer: Customer; channel: Channel | null };
}

export async function sendToConversation(
  db: SupabaseClient, conversationId: string, messages: OutboundMessage[], opts: SendOptions,
) {
  const conv = await load(db, conversationId);
  if (!conv.channel || conv.channel.status === "disabled") throw new Error("This conversation's channel is not connected");
  const token = channelToken(conv.channel);
  const open = windowOpen(conv.last_inbound_at);
  const sent: string[] = [];

  for (let msg of messages) {
    if (!open && msg.kind !== "template") {
      if (conv.channel_type === "whatsapp" && opts.templateFallback && msg.kind === "text") {
        msg = { kind: "template", name: env.waFollowupTemplate, params: [msg.text] };
      } else {
        throw new WindowClosedError(conv.channel_type);
      }
    }
    const externalId = conv.channel_type === "whatsapp"
      ? await sendWhatsApp(conv.channel.external_id, token, conv.customer.external_user_id, msg)
      : await sendInstagram(token, conv.customer.external_user_id, msg);

    const content = msg.kind === "text" ? msg.text : msg.kind === "image" ? (msg.caption ?? "") : `[template ${msg.name}] ${msg.params.join(" | ")}`;
    await db.from("messages").insert({
      vendor_id: conv.vendor_id,
      conversation_id: conv.id,
      direction: "out",
      sender: opts.sender,
      type: msg.kind,
      content,
      media_url: msg.kind === "image" ? msg.url : null,
      external_id: externalId ?? null,
      ai_meta: opts.aiMeta ?? null,
      status: "sent",
    });
    if (externalId) sent.push(externalId);
  }
  await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
  return sent;
}

/** Sends a one-off message (e.g. order update) to whatever conversation an order came from. */
export async function sendToOrderCustomer(db: SupabaseClient, conversationId: string | null, text: string) {
  if (!conversationId) return false;
  try {
    await sendToConversation(db, conversationId, [{ kind: "text", text }], { sender: "system", templateFallback: true });
    return true;
  } catch (e) {
    console.warn("[sendToOrderCustomer]", e instanceof Error ? e.message : e);
    return false;
  }
}
