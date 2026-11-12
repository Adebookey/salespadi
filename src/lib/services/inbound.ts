// Turns normalised channel events into customers, conversations and messages, then queues the AI reply.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundComment, InboundMessage, StatusUpdate } from "../channels/types";
import { downloadWhatsAppMedia } from "../channels/whatsapp";
import { getInstagramProfile, sendInstagramPrivateReply } from "../channels/instagram";
import { AI_REPLY_DELAY_MS, enqueue } from "../jobs";
import { env } from "../env";
import type { Channel, Conversation, Customer, Vendor } from "../types";
import { channelToken } from "./vendor";
import { audit } from "./notify";
import { handleVendorCommand } from "./vendor-commands";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a" };

async function findChannel(db: SupabaseClient, type: "whatsapp" | "instagram", externalId: string) {
  const { data } = await db.from("channels").select("*, vendor:vendors(*)")
    .eq("type", type).eq("external_id", externalId).neq("status", "disabled").maybeSingle();
  return data as (Channel & { vendor: Vendor }) | null;
}

async function upsertCustomerAndConversation(
  db: SupabaseClient, channel: Channel, customerExternalId: string, name: string | undefined, inbound: boolean,
) {
  const now = new Date().toISOString();
  const { data: existing } = await db.from("customers").select("*")
    .eq("vendor_id", channel.vendor_id).eq("channel_type", channel.type).eq("external_user_id", customerExternalId).maybeSingle();

  let customer = existing as Customer | null;
  if (!customer) {
    let displayName = name;
    if (!displayName && channel.type === "instagram") {
      const profile = await getInstagramProfile(channelToken(channel), customerExternalId).catch(() => null);
      displayName = profile?.name || (profile?.username ? `@${profile.username}` : undefined);
    }
    const { data, error } = await db.from("customers").upsert({
      vendor_id: channel.vendor_id, channel_type: channel.type, external_user_id: customerExternalId,
      name: displayName ?? null, phone: channel.type === "whatsapp" ? customerExternalId : null,
      last_inbound_at: inbound ? now : null,
    }, { onConflict: "vendor_id,channel_type,external_user_id" }).select("*").single();
    if (error) throw new Error(`customer upsert: ${error.message}`);
    customer = data as Customer;
  } else if (inbound) {
    await db.from("customers").update({ last_inbound_at: now, ...(name && !customer.name ? { name } : {}) }).eq("id", customer.id);
  }

  const { data: conv, error: cErr } = await db.from("conversations").upsert({
    vendor_id: channel.vendor_id, customer_id: customer.id, channel_type: channel.type, channel_id: channel.id,
  }, { onConflict: "vendor_id,customer_id,channel_type", ignoreDuplicates: false }).select("*").single();
  if (cErr) throw new Error(`conversation upsert: ${cErr.message}`);

  const conversation = conv as Conversation;
  if (inbound) {
    const patch: Record<string, unknown> = { last_inbound_at: now, last_message_at: now };
    if (conversation.status === "closed") patch.status = "ai";
    await db.from("conversations").update(patch).eq("id", conversation.id);
    Object.assign(conversation, patch);
  }
  return { customer, conversation };
}

async function storeMedia(db: SupabaseClient, channel: Channel, msg: InboundMessage, conversationId: string) {
  if (!msg.mediaRef) return null;
  try {
    let bytes: Buffer, mime: string;
    if (msg.channel === "whatsapp") {
      ({ bytes, mime } = await downloadWhatsAppMedia(msg.mediaRef, channelToken(channel)));
    } else {
      const res = await fetch(msg.mediaRef);
      if (!res.ok) throw new Error(`media fetch ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    }
    const path = `${channel.vendor_id}/${conversationId}/${msg.externalMessageId.replace(/[^\w.-]/g, "_")}.${EXT[mime] ?? "bin"}`;
    const { error } = await db.storage.from("chat-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new Error(error.message);
    return path;
  } catch (e) {
    console.warn("[storeMedia]", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function processInboundMessage(db: SupabaseClient, msg: InboundMessage) {
  // Messages to the platform's own number are commands from vendors ("CONFIRM 1042").
  if (msg.channel === "whatsapp" && env.platformWaPhoneNumberId && msg.channelExternalId === env.platformWaPhoneNumberId) {
    return handleVendorCommand(db, msg);
  }

  const channel = await findChannel(db, msg.channel, msg.channelExternalId);
  if (!channel) {
    console.warn(`[inbound] no channel for ${msg.channel} ${msg.channelExternalId}`);
    return;
  }
  const { data: dup } = await db.from("messages").select("id").eq("external_id", msg.externalMessageId).maybeSingle();
  if (dup) return; // Meta retried a webhook we already handled

  const { customer, conversation } = await upsertCustomerAndConversation(db, channel, msg.customerExternalId, msg.customerName, true);
  const mediaPath = await storeMedia(db, channel, msg, conversation.id);
  const content = msg.type === "story_reply" ? `(Replied to your story) ${msg.text}` : msg.text;

  const { error } = await db.from("messages").insert({
    vendor_id: channel.vendor_id, conversation_id: conversation.id, direction: "in", sender: "customer",
    type: msg.type, content, media_url: mediaPath, external_id: msg.externalMessageId,
    created_at: msg.timestamp.toISOString(),
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(`message insert: ${error.message}`);

  const vendor = channel.vendor;
  if (conversation.status === "human") {
    await db.from("conversations").update({ needs_attention: true }).eq("id", conversation.id);
    return;
  }
  if (vendor.ai_enabled && vendor.status === "live") {
    // Short delay so a burst of messages ("hi" / "do you have" / "size 42") gets one reply.
    await enqueue("ai.reply", { conversationId: conversation.id }, { runAt: new Date(Date.now() + AI_REPLY_DELAY_MS), dedupeKey: `slot:ai:${conversation.id}` });
  } else {
    await db.from("conversations").update({ needs_attention: true }).eq("id", conversation.id);
  }

  const { data: settings } = await db.from("vendor_settings").select("followup_enabled").eq("vendor_id", vendor.id).single();
  if (settings?.followup_enabled) {
    await enqueue("followup.enquiry", { conversationId: conversation.id, afterMessage: msg.externalMessageId, customerId: customer.id },
      { runAt: new Date(Date.now() + 20 * 3600_000), dedupeKey: `once:followup:${msg.externalMessageId}` });
  }
}

export async function processStatuses(db: SupabaseClient, statuses: StatusUpdate[]) {
  for (const s of statuses) {
    await db.from("messages").update({ status: s.status }).eq("external_id", s.externalMessageId);
  }
}

/** Comment-to-DM: "comment PRICE" on a post gets an automatic private reply. */
export async function processComment(db: SupabaseClient, c: InboundComment) {
  const channel = await findChannel(db, "instagram", c.channelExternalId);
  if (!channel) return;
  const { data: triggers } = await db.from("comment_triggers").select("*").eq("vendor_id", channel.vendor_id).eq("is_active", true);
  const text = c.text.toLowerCase();
  const trigger = (triggers ?? []).find((t: { keyword: string; media_id: string | null }) =>
    new RegExp(`(^|\\W)${t.keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(text) &&
    (!t.media_id || t.media_id === c.mediaId));
  if (!trigger) return;

  const { data: done } = await db.from("audit_log").select("id").eq("action", "comment_dm").eq("entity_id", c.commentId).maybeSingle();
  if (done) return;

  const externalId = await sendInstagramPrivateReply(channelToken(channel), c.commentId, trigger.reply_text);
  await audit(db, channel.vendor_id, "comment_dm", "comment", c.commentId, { keyword: trigger.keyword, from: c.fromUsername });
  if (c.fromId) {
    const { conversation } = await upsertCustomerAndConversation(db, channel, c.fromId, c.fromUsername ? `@${c.fromUsername}` : undefined, false);
    await db.from("messages").insert([
      { vendor_id: channel.vendor_id, conversation_id: conversation.id, direction: "in", sender: "customer", type: "comment", content: `(Comment on a post) ${c.text}`, external_id: `comment:${c.commentId}` },
      { vendor_id: channel.vendor_id, conversation_id: conversation.id, direction: "out", sender: "ai", type: "text", content: trigger.reply_text, external_id: externalId ?? null, status: "sent" },
    ]);
  }
}
