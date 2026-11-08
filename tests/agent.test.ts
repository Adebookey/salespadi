import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { normaliseHistory, runAgent } from "@/lib/ai/agent";
import { demoStore } from "./fixtures/demo-vendor";

type Block = Record<string, unknown>;

/** A fake Anthropic client that replays scripted responses and records requests. */
function fakeClient(script: { content: Block[]; stop_reason: string }[]) {
  const requests: Record<string, unknown>[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: async (req: Record<string, unknown>) => {
          requests.push(structuredClone(req));
          const step = script[i++];
          if (!step) throw new Error("script exhausted");
          return { id: `msg_${i}`, model: req.model, role: "assistant", type: "message", stop_reason: step.stop_reason, content: step.content, usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0 } };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

describe("runAgent", () => {
  it("runs tools and returns the final reply with photos", async () => {
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_products", input: { query: "chelsea boots" } }] },
      { stop_reason: "tool_use", content: [{ type: "text", text: "Let me show you." }, { type: "tool_use", id: "t2", name: "send_product_photos", input: { product_id: "p-chelsea", max_photos: 1 } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Here they are dear, ₦35,000. Which size?" }] },
    ]);
    const r = await runAgent({ store: demoStore(), history: [], incoming: [{ type: "text", text: "Show me chelsea boots" }], client });
    expect(r.reply).toBe("Here they are dear, ₦35,000. Which size?");
    expect(r.photos).toHaveLength(1);
    expect(r.toolCalls.map((t) => t.name)).toEqual(["search_products", "send_product_photos"]);
    expect(r.model).toBe("claude-haiku-5-5");
    expect(r.usage).toHaveLength(3);

    // Tool results go back in one user message, matched by id.
    const second = requests[1].messages as { role: string; content: Block[] }[];
    const last = second[second.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    // The system prompt is cached.
    expect((requests[0].system as Block[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("routes images to the stronger model with server-side fallback", async () => {
    const { client, requests } = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Nice one!" }] }]);
    await runAgent({
      store: demoStore(), history: [], client,
      incoming: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } }, { type: "text", text: "this one" }],
    });
    expect(requests[0].model).toBe("claude-sonnet-5-5");
    expect(requests[0].fallbacks).toBe("default");
    expect(requests[0].betas).toEqual(["server-side-fallback-2026-07-01"]);
  });

  it("hands off when the model declines", async () => {
    const store = demoStore();
    const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);
    const r = await runAgent({ store, history: [], incoming: [{ type: "text", text: "hello" }], client });
    expect(r.handedOff).toBe(true);
    expect(store.handoffs).toHaveLength(1);
    expect(r.reply).toMatch(/team will reply/);
  });

  it("returns tool errors to the model instead of crashing", async () => {
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "create_order", input: { items: [] } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Which item would you like?" }] },
    ]);
    const r = await runAgent({ store: demoStore(), history: [], incoming: [{ type: "text", text: "order" }], client });
    expect(r.reply).toBe("Which item would you like?");
    const msgs = requests[1].messages as { content: Block[] }[];
    expect(msgs[msgs.length - 1].content[0]).toMatchObject({ type: "tool_result", is_error: true });
  });

  it("stops and hands off if the loop never ends", async () => {
    const store = demoStore();
    const loop = Array.from({ length: 8 }, (_, i) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${i}`, name: "get_order_status", input: {} }] }));
    const { client } = fakeClient(loop);
    const r = await runAgent({ store, history: [], incoming: [{ type: "text", text: "hi" }], client });
    expect(r.handedOff).toBe(true);
    expect(r.reply).toBeTruthy();
  });

  it("merges unanswered customer messages into the new turn", async () => {
    const { client, requests } = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }]);
    await runAgent({
      store: demoStore(), client,
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello!" }, { role: "user", content: "are you there?" }],
      incoming: [{ type: "text", text: "hello??" }],
    });
    const msgs = requests[0].messages as { role: string; content: Block[] }[];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content.map((b) => b.text)).toEqual(expect.arrayContaining(["are you there?", "hello??"]));
  });
});

describe("normaliseHistory", () => {
  it("starts with a user turn, alternates roles, and prepends the summary", () => {
    const out = normaliseHistory(
      [{ role: "assistant", content: "Hi from the shop" }, { role: "assistant", content: "We have new stock" }, { role: "user", content: "nice" }],
      "Customer is Ada from Yaba.",
    );
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(out[0].content)).toContain("Ada from Yaba");
    expect((out[1].content as unknown as Block[]).length).toBe(2);
  });
});
