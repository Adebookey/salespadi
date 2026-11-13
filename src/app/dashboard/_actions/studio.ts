"use server";
import type Anthropic from "@anthropic-ai/sdk";
import { getVendorForUser } from "@/lib/auth";
import { runAgent } from "@/lib/ai/agent";
import { loadStudioStore } from "@/lib/services/studio-store";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import type { MemoryStore } from "@/lib/ai/memory-store";

export interface StudioTurn { role: "user" | "assistant"; text: string }
export interface StudioResult {
  reply?: string;
  photos?: { url: string; caption: string }[];
  toolCalls?: { name: string; input: unknown; result: unknown }[];
  handedOff?: boolean;
  model?: string;
  costUsd?: number;
  state?: StudioState;
  error?: string;
}
export type StudioState = ReturnType<MemoryStore["snapshot"]>;

export async function runStudio(
  vendorId: string, history: StudioTurn[], text: string, imageDataUrl?: string, state?: StudioState,
): Promise<StudioResult> {
  const { supabase } = await getVendorForUser(vendorId);
  if (!env.anthropicApiKey) return { error: "ANTHROPIC_API_KEY is not set on the server." };
  const store = await loadStudioStore(supabase, vendorId);
  store.restore(state);
  const incoming: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (imageDataUrl) {
    const m = imageDataUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
    if (m) {
      incoming.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } });
      store.lastImage = "studio-upload";
    }
  }
  incoming.push({ type: "text", text: text || "[customer sent the photo above]" });
  try {
    const r = await runAgent({ store, history: history.map((h) => ({ role: h.role, content: h.text })), incoming });
    // Studio tests cost real money too, so they count towards the vendor's AI spend.
    await adminClient().from("ai_usage").insert(r.usage.map((u) => ({
      vendor_id: vendorId, model: u.model, input_tokens: u.input_tokens, output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_tokens, cost_usd_micros: u.cost_usd_micros,
    })));
    return {
      reply: r.reply, photos: r.photos, toolCalls: r.toolCalls, handedOff: r.handedOff, model: r.model,
      costUsd: r.usage.reduce((s, u) => s + u.cost_usd_micros, 0) / 1e6,
      state: store.snapshot(),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
