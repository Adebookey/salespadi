import { describe, expect, it } from "vitest";
import { executeTool, matchZone, TOOLS, type ToolContext } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { demoProfile, demoStore, demoZones } from "./fixtures/demo-vendor";

const ctx = (store = demoStore()): ToolContext => ({ store, outbox: [], handedOff: false });

describe("tool definitions", () => {
  it("are strict, closed schemas", () => {
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect((t.input_schema as unknown as { additionalProperties: boolean }).additionalProperties).toBe(false);
    }
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});

describe("tools over the demo catalog", () => {
  it("searches and returns prices from the catalog", async () => {
    const r = (await executeTool("search_products", { query: "white sneakers" }, ctx())) as { results: { name: string; price: string }[] };
    expect(r.results[0]).toMatchObject({ name: "Classic White Sneakers", price: "₦28,000" });
  });
  it("reports sold-out items", async () => {
    const r = (await executeTool("search_products", { query: "oxford" }, ctx())) as { results: { sold_out: boolean }[] };
    expect(r.results[0].sold_out).toBe(true);
  });
  it("returns options with stock for a product", async () => {
    const r = (await executeTool("check_stock", { product_id: "p-redheels" }, ctx())) as { options: { option: string; stock: number }[] };
    expect(r.options.map((o) => o.option)).toContain("Size 39");
  });
  it("queues product photos with captions", async () => {
    const c = ctx();
    await executeTool("send_product_photos", { product_id: "p-chelsea", max_photos: 10 }, c);
    expect(c.outbox).toHaveLength(1);
    expect(c.outbox[0].caption).toBe("Black Chelsea Boots - ₦35,000");
  });
  it("matches delivery zones by area", async () => {
    expect(matchZone(demoZones, "12 Admiralty Way, Lekki Phase 1")?.name).toBe("Lagos Island");
    expect(matchZone(demoZones, "surulere")?.name).toBe("Lagos Mainland");
    expect(matchZone(demoZones, "Kano")).toBeUndefined();
    const r = (await executeTool("get_delivery_fee", { area: "Yaba" }, ctx())) as { fee: string };
    expect(r.fee).toBe("₦2,500");
    const none = (await executeTool("get_delivery_fee", { area: "Kano" }, ctx())) as { found: boolean; zones: unknown[] };
    expect(none.found).toBe(false);
    expect(none.zones).toHaveLength(3);
  });
  it("creates an order with correct totals and refuses more than stock", async () => {
    const store = demoStore();
    const c = ctx(store);
    const order = (await executeTool("create_order", {
      items: [{ variant_id: "p-redheels-39", quantity: 2 }], delivery_zone_id: "zone-island",
      delivery_address: "12 Adeola Odeku, VI", customer_name: "Amaka Obi", customer_phone: "08031234567", notes: "",
    }, c)) as { order_number: number; total: string };
    expect(order.total).toBe("₦39,500"); // 2 x 18,000 + 3,500
    expect(c.orderCreated).toBeDefined();
    const tooMany = (await executeTool("create_order", {
      items: [{ variant_id: "p-redheels-39", quantity: 3 }], delivery_zone_id: "zone-island",
      delivery_address: "12 Adeola Odeku, VI", customer_name: "Amaka Obi", customer_phone: "08031234567", notes: "",
    }, ctx(store))) as { error: string };
    expect(tooMany.error).toMatch(/sold out/); // the first order reserved both pairs
  });
  it("creates a payment link and records transfer choice", async () => {
    const store = demoStore();
    const c = ctx(store);
    const o = (await executeTool("create_order", {
      items: [{ variant_id: "p-sneakers-42", quantity: 1 }], delivery_zone_id: "zone-mainland",
      delivery_address: "5 Herbert Macaulay Way, Yaba", customer_name: "Tunde", customer_phone: "08011111111", notes: "",
    }, c)) as { order_id: string };
    const link = (await executeTool("create_payment_link", { order_id: o.order_id }, c)) as { payment_url: string };
    expect(link.payment_url).toMatch(/^https:\/\/checkout\.paystack\.com\//);
    const bank = (await executeTool("choose_bank_transfer", { order_id: o.order_id }, c)) as { bank: { account_number: string } };
    expect(bank.bank.account_number).toBe("0123456789");
    const proof = (await executeTool("record_transfer_proof", { order_id: o.order_id }, c)) as { ok: boolean };
    expect(proof.ok).toBe(false); // no image received yet
  });
  it("hands off", async () => {
    const store = demoStore();
    const c = ctx(store);
    await executeTool("handoff_to_human", { reason: "Refund request" }, c);
    expect(c.handedOff).toBe(true);
    expect(store.handoffs).toEqual(["Refund request"]);
  });
  it("rejects invalid input", async () => {
    await expect(executeTool("create_order", { items: [] }, ctx())).rejects.toThrow();
    await expect(executeTool("nope", {}, ctx())).rejects.toThrow(/Unknown tool/);
  });
});

describe("eval suite", () => {
  it("has 20 cases with unique names, and its grader catches invented prices", async () => {
    const { CASES, grade } = await import("../scripts/eval-agent");
    expect(CASES).toHaveLength(20);
    expect(new Set(CASES.map((c) => c.name)).size).toBe(20);
    const truth = buildSystemPrompt(demoProfile, demoZones);
    const base = { photos: [], handedOff: false, model: "m", usage: [] };
    const ok = grade(CASES[1], { ...base, reply: "Yes, ₦28,000 in size 42", toolCalls: [{ name: "search_products", input: {}, result: { price: "₦28,000" } }] }, truth);
    expect(ok).toEqual([]);
    const bad = grade(CASES[1], { ...base, reply: "Yes, ₦25,000 in size 42", toolCalls: [{ name: "search_products", input: {}, result: { price: "₦28,000" } }] }, truth);
    expect(bad).toEqual(expect.arrayContaining(["invented amount ₦25000"]));
  });
});

describe("system prompt", () => {
  const prompt = buildSystemPrompt(demoProfile, demoZones);
  it("contains the vendor's facts and rules", () => {
    expect(prompt).toContain("Kicks by Tolu");
    expect(prompt).toContain("Exchange within 3 days");
    expect(prompt).toContain("Are your shoes original?");
    expect(prompt).toContain("Lagos Island: ₦3,500");
    expect(prompt).toContain("0123456789");
    expect(prompt).toMatch(/Pidgin/);
  });
  it("is stable (no timestamps) so it can be cached", () => {
    expect(buildSystemPrompt(demoProfile, demoZones)).toBe(prompt);
  });
});
