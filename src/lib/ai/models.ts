// Model choice and pricing. Model names come from env so they can change without a deploy.
import { env } from "../env";

/** USD per million tokens. Keep in sync with Anthropic's pricing page. */
export const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Cost in micro-dollars (1e-6 USD) so it can be stored as an integer. */
export function costMicros(model: string, u: UsageLike): number {
  const p = PRICING[model] ?? PRICING["claude-sonnet-5-5"];
  const usd =
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

const HARD_CASE = /\b(refund|scam|fraud|complain|complaint|angry|disappoint|useless|nonsense|police|report you|wrong item|damaged|not delivered|never (arrived|came)|where is my (order|package)|wahala|vex)\b/i;

/** Routine replies go to the cheap model; images and touchy messages go to the stronger one. */
export function pickModel(input: { hasImage: boolean; text: string; previousFailures?: number }) {
  if (input.hasImage || (input.previousFailures ?? 0) > 0 || HARD_CASE.test(input.text)) {
    return { model: env.aiModelHard, hard: true };
  }
  return { model: env.aiModelRoutine, hard: false };
}
