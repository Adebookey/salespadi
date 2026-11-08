// The sales agent: a manual tool-use loop over the vendor's catalog and order tools.
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompt";
import { TOOLS, executeTool, type ToolContext } from "./tools";
import { costMicros, pickModel } from "./models";
import type { AgentStore } from "./store";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

export interface AgentInput {
  store: AgentStore;
  /** Earlier turns as plain text (oldest first), already alternating user/assistant. */
  history: MessageParam[];
  /** Rolling summary of older messages that were dropped from history. */
  summary?: string;
  /** The new customer message(s): text and/or images. */
  incoming: ContentBlock[];
  now?: Date;
  client?: Anthropic;
  forceModel?: string;
}

export interface AgentUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd_micros: number;
}

export interface AgentResult {
  reply: string;
  photos: { url: string; caption: string }[];
  handedOff: boolean;
  handoffReason?: string;
  orderCreated?: string;
  model: string;
  usage: AgentUsage[];
  toolCalls: { name: string; input: unknown; result: unknown }[];
}

const MAX_STEPS = 8;

export const lagosTime = (d: Date) =>
  new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const client = input.client ?? new Anthropic();
  const [vendor, zones] = await Promise.all([input.store.vendor(), input.store.deliveryZones()]);
  const system = buildSystemPrompt(vendor, zones);

  const text = input.incoming.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ");
  const hasImage = input.incoming.some((b) => b.type === "image");
  const picked = input.forceModel ? { model: input.forceModel, hard: true } : pickModel({ hasImage, text });

  const messages: MessageParam[] = normaliseHistory(input.history, input.summary);
  const newTurn: ContentBlock[] = [...input.incoming, { type: "text", text: `[Lagos time now: ${lagosTime(input.now ?? new Date())}]` }];
  const last = messages[messages.length - 1];
  // Earlier customer messages that never got a reply (e.g. while a person was handling the chat) join this turn.
  if (last?.role === "user") last.content = [...(last.content as ContentBlock[]), ...newTurn];
  else messages.push({ role: "user", content: newTurn });

  const ctx: ToolContext = { store: input.store, outbox: [], handedOff: false };
  const usage: AgentUsage[] = [];
  const toolCalls: AgentResult["toolCalls"] = [];
  let reply = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const isSonnet = picked.model.includes("sonnet");
    const response = await client.beta.messages.create({
      model: picked.model,
      max_tokens: 4096,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: picked.hard ? "medium" : "low" },
      // Sonnet: if a safety classifier declines, the server retries on a suitable fallback model.
      ...(isSonnet ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    const u = response.usage;
    usage.push({
      model: response.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cost_usd_micros: costMicros(response.model, u),
    });

    if (response.stop_reason === "refusal") {
      await input.store.handoff("The assistant could not answer this message safely");
      ctx.handedOff = true;
      ctx.handoffReason = "Assistant declined";
      reply = "Thanks for your message. A member of our team will reply you shortly.";
      break;
    }

    // Keep the assistant turn exactly as returned (including thinking blocks) for the rest of this loop.
    messages.push({ role: "assistant", content: response.content as ContentBlock[] });
    const texts = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text);
    if (texts.length) reply = texts.join("\n").trim();

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      let result: unknown;
      let isError = false;
      try {
        result = await executeTool(t.name, t.input, ctx);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
        isError = true;
      }
      toolCalls.push({ name: t.name, input: t.input, result });
      results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result), is_error: isError });
    }
    messages.push({ role: "user", content: results });

    if (step === MAX_STEPS - 1) {
      await input.store.handoff("Assistant got stuck on this conversation");
      ctx.handedOff = true;
      reply = reply || "Let me get someone from the team to help you with this. They'll reply shortly.";
    }
  }

  return {
    reply,
    photos: ctx.outbox,
    handedOff: ctx.handedOff,
    handoffReason: ctx.handoffReason,
    orderCreated: ctx.orderCreated,
    model: picked.model,
    usage,
    toolCalls,
  };
}

/** Ensures history starts with a user turn and alternates roles (merging neighbours with the same role). */
export function normaliseHistory(history: MessageParam[], summary?: string): MessageParam[] {
  const out: MessageParam[] = [];
  const toBlocks = (c: MessageParam["content"]): ContentBlock[] =>
    typeof c === "string" ? [{ type: "text", text: c }] : (c as ContentBlock[]);

  if (summary) out.push({ role: "user", content: [{ type: "text", text: `<earlier_conversation_summary>\n${summary}\n</earlier_conversation_summary>` }] });
  for (const m of history) {
    if (m.role === "system") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = [...toBlocks(last.content), ...toBlocks(m.content)];
    else out.push({ role: m.role, content: toBlocks(m.content) });
  }
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: [{ type: "text", text: "(conversation started by the business)" }] });
  return out;
}
