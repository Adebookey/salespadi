// The ai.reply job: gathers unanswered customer messages, runs the agent, sends the reply and records cost.
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "../ai/agent";
import { summarize } from "../ai/summarize";
import type { Conversation, Customer, Message, Vendor } from "../types";
import { SupabaseAgentStore } from "./agent-store";
import { sendToConversation } from "./messaging";
import { transcribe } from "./transcribe";

type Block = Anthropic.Beta.BetaContentBlockParam;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const HISTORY_LIMIT = 20;
const SUMMARISE_AFTER = 30;

async function download(db: SupabaseClient, path: string) {
  const { data, error } = await db.storage.from("chat-media").download(path);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type };
}

export function toHistory(messages: Message[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m) => {
    if (m.direction === "in") {
      const extra = m.type === "image" ? " [sent a photo]" : m.type === "audio" ? " [sent a voice note]" : "";
      return { role: "user" as const, content: `${m.content}${extra}`.trim() || "[message]" };
    }
    const prefix = m.sender === "human" ? "[Reply from the team] " : "";
    const body = m.type === "image" ? `[sent photo: ${m.content}]` : m.content;
    return { role: "assistant" as const, content: `${prefix}${body}` };
  });
}

async function buildIncoming(db: SupabaseClient, pending: Message[]) {
  const blocks: Block[] = [];
  let latestImagePath: string | null = null;
  let images = 0;
  for (const m of pending) {
    if (m.type === "image" && m.media_url && images < 3) {
      const file = await download(db, m.media_url);
      if (file && (IMAGE_TYPES as readonly string[]).includes(file.mime)) {
        blocks.push({ type: "image", source: { type: "base64", media_type: file.mime as (typeof IMAGE_TYPES)[number], data: file.bytes.toString("base64") } });
        latestImagePath = m.media_url;
        images++;
      }
      blocks.push({ type: "text", text: m.content ? `[photo caption] ${m.content}` : "[customer sent the photo above]" });
    } else if (m.type === "audio") {
      const file = m.media_url ? await download(db, m.media_url) : null;
      const text = file ? await transcribe(file.bytes, file.mime) : null;
      if (text) {
        await db.from("messages").update({ content: `🎤 ${text}` }).eq("id", m.id);
        blocks.push({ type: "text", text: `[voice note, transcribed] ${text}` });
      } else {
        blocks.push({ type: "text", text: "[The customer sent a voice note that could not be played. Politely ask them to type the message.]" });
      }
    } else {
      blocks.push({ type: "text", text: m.content || "[empty message]" });
    }
  }
  return { blocks, latestImagePath };
}

export async function aiReply(db: SupabaseClient, conversationId: string) {
  for (let round = 0; round < 3; round++) {
    const { data } = await db.from("conversations")
      .select("*, customer:customers(*), vendor:vendors(*)").eq("id", conversationId).single();
    if (!data) return;
    const conv = data as Conversation & { customer: Customer; vendor: Vendor };
    if (conv.status !== "ai" || !conv.vendor.ai_enabled || conv.vendor.status !== "live") return;

    let query = db.from("messages").select("*").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(60);
    if (conv.summary_until) query = query.gt("created_at", conv.summary_until);
    const { data: rows } = await query;
    const messages = ((rows ?? []) as Message[]).reverse();

    const lastOut = messages.map((m) => m.direction).lastIndexOf("out");
    const pending = messages.slice(lastOut + 1).filter((m) => m.direction === "in");
    if (!pending.length) return;
    const earlier = messages.slice(0, lastOut + 1).slice(-HISTORY_LIMIT);

    const { blocks, latestImagePath } = await buildIncoming(db, pending);
    const store = new SupabaseAgentStore(db,
      { vendorId: conv.vendor_id, customerId: conv.customer_id, conversationId }, latestImagePath);

    const customerNote = conv.customer.name || conv.customer.phone
      ? `[Known customer details - name: ${conv.customer.name ?? "unknown"}, phone: ${conv.customer.phone ?? "unknown"}${conv.customer.address ? `, address: ${conv.customer.address}` : ""}]`
      : "";
    const result = await runAgent({
      store,
      history: toHistory(earlier),
      summary: [conv.summary, customerNote].filter(Boolean).join("\n"),
      incoming: blocks,
    });

    const aiMeta = { model: result.model, tools: result.toolCalls.map((t) => t.name), handed_off: result.handedOff };
    const outgoing = [
      ...(result.reply ? [{ kind: "text" as const, text: result.reply }] : []),
      ...result.photos.map((p) => ({ kind: "image" as const, url: p.url, caption: p.caption })),
    ];
    if (outgoing.length) await sendToConversation(db, conversationId, outgoing, { sender: "ai", aiMeta });

    await db.from("ai_usage").insert(result.usage.map((u) => ({
      vendor_id: conv.vendor_id, conversation_id: conversationId, model: u.model,
      input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_tokens: u.cache_read_tokens,
      cost_usd_micros: u.cost_usd_micros,
    })));

    if (messages.length >= SUMMARISE_AFTER) await foldIntoSummary(db, conv, messages);

    // Did the customer write again while we were replying? Then go round once more.
    const newest = pending[pending.length - 1].created_at;
    const { count } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId).eq("direction", "in").gt("created_at", newest);
    if (!count) return;
  }
}

async function foldIntoSummary(db: SupabaseClient, conv: Conversation, messages: Message[]) {
  const older = messages.slice(0, messages.length - HISTORY_LIMIT);
  if (!older.length) return;
  const transcript = older.map((m) => `${m.direction === "in" ? "Customer" : m.sender === "human" ? "Team" : "Assistant"}: ${m.content}`).join("\n");
  try {
    const s = await summarize(conv.summary, transcript);
    await db.from("conversations").update({ summary: s.summary, summary_until: older[older.length - 1].created_at }).eq("id", conv.id);
    await db.from("ai_usage").insert({
      vendor_id: conv.vendor_id, conversation_id: conv.id, model: s.model,
      input_tokens: s.usage.input_tokens, output_tokens: s.usage.output_tokens, cost_usd_micros: s.costMicros,
    });
  } catch (e) {
    console.warn("[summary]", e);
  }
}
