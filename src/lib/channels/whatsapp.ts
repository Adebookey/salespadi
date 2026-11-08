// WhatsApp Cloud API: webhook parsing, sending and media download.
import { env } from "../env";
import type { InboundMessage, OutboundMessage, StatusUpdate } from "./types";

const graph = () => `https://graph.facebook.com/${env.metaGraphVersion}`;

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Meta payloads */
export function parseWhatsAppWebhook(body: any): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v?.metadata?.phone_number_id) continue;
      const names = new Map<string, string>(
        (v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]),
      );
      for (const m of v.messages ?? []) {
        const base = {
          channel: "whatsapp" as const,
          channelExternalId: v.metadata.phone_number_id,
          customerExternalId: m.from,
          customerName: names.get(m.from),
          externalMessageId: m.id,
          timestamp: new Date(Number(m.timestamp) * 1000),
        };
        switch (m.type) {
          case "text":
            messages.push({ ...base, type: "text", text: m.text?.body ?? "" });
            break;
          case "image":
            messages.push({ ...base, type: "image", text: m.image?.caption ?? "", mediaRef: m.image?.id, mediaMime: m.image?.mime_type });
            break;
          case "audio":
            messages.push({ ...base, type: "audio", text: "", mediaRef: m.audio?.id, mediaMime: m.audio?.mime_type });
            break;
          case "button":
            messages.push({ ...base, type: "text", text: m.button?.text ?? "" });
            break;
          case "interactive":
            messages.push({
              ...base, type: "text",
              text: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "",
            });
            break;
          default:
            messages.push({ ...base, type: "other", text: `[${m.type} message]` });
        }
      }
      for (const s of v.statuses ?? []) statuses.push({ externalMessageId: s.id, status: s.status });
    }
  }
  return { messages, statuses };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function sendWhatsApp(
  phoneNumberId: string, accessToken: string, to: string, msg: OutboundMessage,
): Promise<string | undefined> {
  const body: Record<string, unknown> = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (msg.kind === "text") Object.assign(body, { type: "text", text: { body: msg.text, preview_url: true } });
  if (msg.kind === "image") Object.assign(body, { type: "image", image: { link: msg.url, caption: msg.caption } });
  if (msg.kind === "template") {
    Object.assign(body, {
      type: "template",
      template: {
        name: msg.name,
        language: { code: msg.language ?? "en" },
        components: msg.params.length
          ? [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text: templateSafe(text) })) }]
          : [],
      },
    });
  }
  const res = await fetch(`${graph()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${JSON.stringify(json)}`);
  return json?.messages?.[0]?.id;
}

/** Downloads a WhatsApp media object (image, voice note) and returns its bytes. */
export async function downloadWhatsAppMedia(mediaId: string, accessToken: string) {
  const meta = await fetch(`${graph()}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meta.ok) throw new Error(`WhatsApp media lookup failed (${meta.status})`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!file.ok) throw new Error(`WhatsApp media download failed (${file.status})`);
  return { bytes: Buffer.from(await file.arrayBuffer()), mime: mime_type };
}

/** Template variables cannot contain newlines, tabs or more than four spaces in a row. */
export function templateSafe(text: string) {
  return text.replace(/[\t\r]/g, " ").replace(/\n+/g, " · ").replace(/ {4,}/g, "   ").trim() || "-";
}
