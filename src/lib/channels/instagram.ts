// Instagram messaging (Instagram API with Instagram Login): webhook parsing and sending.
import { env } from "../env";
import type { InboundComment, InboundMessage, OutboundMessage } from "./types";

const graph = () => `https://graph.instagram.com/${env.metaGraphVersion}`;

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Meta payloads */
export function parseInstagramWebhook(body: any): { messages: InboundMessage[]; comments: InboundComment[] } {
  const messages: InboundMessage[] = [];
  const comments: InboundComment[] = [];
  if (body?.object !== "instagram") return { messages, comments };

  for (const entry of body.entry ?? []) {
    const accountId = String(entry.id);
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      if (!m || m.is_echo || m.is_deleted) continue; // echoes are our own sends
      const base = {
        channel: "instagram" as const,
        channelExternalId: accountId,
        customerExternalId: String(ev.sender?.id),
        externalMessageId: String(m.mid),
        timestamp: new Date(Number(ev.timestamp) || Date.now()),
      };
      const image = (m.attachments ?? []).find((a: any) => a.type === "image" || a.type === "share");
      const audio = (m.attachments ?? []).find((a: any) => a.type === "audio");
      if (m.reply_to?.story) {
        messages.push({ ...base, type: "story_reply", text: m.text ?? "", mediaRef: m.reply_to.story.url });
      } else if (image) {
        messages.push({ ...base, type: "image", text: m.text ?? "", mediaRef: image.payload?.url });
      } else if (audio) {
        messages.push({ ...base, type: "audio", text: "", mediaRef: audio.payload?.url });
      } else {
        messages.push({ ...base, type: "text", text: m.text ?? "" });
      }
    }
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      const v = change.value;
      if (v.from?.id && String(v.from.id) === accountId) continue; // our own comment
      comments.push({
        channelExternalId: accountId,
        commentId: String(v.id),
        text: v.text ?? "",
        mediaId: v.media?.id ? String(v.media.id) : undefined,
        fromId: v.from?.id ? String(v.from.id) : undefined,
        fromUsername: v.from?.username,
      });
    }
  }
  return { messages, comments };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function post(accessToken: string, body: unknown) {
  const res = await fetch(`${graph()}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram send failed (${res.status}): ${JSON.stringify(json)}`);
  return json?.message_id as string | undefined;
}

export async function sendInstagram(accessToken: string, recipientId: string, msg: OutboundMessage) {
  if (msg.kind === "template") throw new Error("Instagram has no message templates");
  if (msg.kind === "text") return post(accessToken, { recipient: { id: recipientId }, message: { text: msg.text } });
  const id = await post(accessToken, {
    recipient: { id: recipientId },
    message: { attachment: { type: "image", payload: { url: msg.url } } },
  });
  if (msg.caption) await post(accessToken, { recipient: { id: recipientId }, message: { text: msg.caption } });
  return id;
}

/** Private reply: a DM sent in response to a comment (comment-to-DM). */
export async function sendInstagramPrivateReply(accessToken: string, commentId: string, text: string) {
  return post(accessToken, { recipient: { comment_id: commentId }, message: { text } });
}

/** Recent posts, used to import products from captions. */
export async function listInstagramMedia(accessToken: string, limit = 25) {
  const url = `${graph()}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Instagram media list failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as {
    data: { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string }[];
  };
  return json.data;
}

export async function getInstagramProfile(accessToken: string, userId: string) {
  const res = await fetch(`${graph()}/${userId}?fields=name,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { name?: string; username?: string };
}
