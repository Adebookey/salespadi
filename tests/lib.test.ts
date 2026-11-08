import { describe, expect, it } from "vitest";
import { randomBytes, createHmac } from "node:crypto";
import { formatNaira, parseNairaToKobo } from "@/lib/money";
import { decrypt, encrypt, verifyHmac } from "@/lib/crypto";
import { costMicros, pickModel } from "@/lib/ai/models";
import { parseFaqs, faqsToText } from "@/lib/faqs";
import { windowOpen } from "@/lib/services/messaging";
import { lagosStartOfDay } from "@/lib/services/reports";
import { rankProducts, searchWords } from "@/lib/services/agent-store";
import { verifyPaystackSignature } from "@/lib/paystack";

describe("money", () => {
  it("formats kobo as naira", () => {
    expect(formatNaira(2800000)).toBe("₦28,000");
    expect(formatNaira(150)).toBe("₦1.5");
    expect(formatNaira(null)).toBe("₦0");
  });
  it("parses naira strings", () => {
    expect(parseNairaToKobo("₦18,000")).toBe(1800000);
    expect(parseNairaToKobo("18k")).toBe(1800000);
    expect(parseNairaToKobo("18.5k")).toBe(1850000);
    expect(parseNairaToKobo("1.2m")).toBe(120000000);
    expect(parseNairaToKobo("3500 naira")).toBe(350000);
    expect(parseNairaToKobo("abc")).toBeNull();
    expect(parseNairaToKobo(-5)).toBeNull();
  });
});

describe("crypto", () => {
  const key = randomBytes(32);
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("EAAG-secret-token", key);
    const b = encrypt("EAAG-secret-token", key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe("EAAG-secret-token");
  });
  it("rejects tampered ciphertext", () => {
    const parts = encrypt("hello", key).split(".");
    parts[3] = Buffer.from("jello").toString("base64");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });
  it("verifies Meta and Paystack signatures", () => {
    const body = '{"a":1}';
    const meta = "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(verifyHmac("sha256", "app-secret", body, meta, "sha256=")).toBe(true);
    expect(verifyHmac("sha256", "wrong", body, meta, "sha256=")).toBe(false);
    expect(verifyHmac("sha256", "app-secret", body, null, "sha256=")).toBe(false);
    const ps = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(verifyPaystackSignature("sk_test_x", body, ps)).toBe(true);
    expect(verifyPaystackSignature("sk_test_x", body + " ", ps)).toBe(false);
  });
});

describe("model routing and cost", () => {
  it("uses the routine model for normal chat", () => {
    expect(pickModel({ hasImage: false, text: "how much is the sneakers" }).hard).toBe(false);
  });
  it("uses the strong model for images and complaints", () => {
    expect(pickModel({ hasImage: true, text: "" }).hard).toBe(true);
    expect(pickModel({ hasImage: false, text: "I want a refund, this is a scam" }).hard).toBe(true);
    expect(pickModel({ hasImage: false, text: "Where is my order??" }).hard).toBe(true);
  });
  it("computes cost in micro-dollars", () => {
    // 1M input + 1M output on Haiku 5.5 = $0.10 + $0.50
    expect(costMicros("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(600_000);
    expect(costMicros("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 10000 })).toBe(2000 + 5000 + 2000);
  });
});

describe("helpers", () => {
  it("parses FAQ blocks and writes them back", () => {
    const faqs = parseFaqs("Are they original?\nYes, all original.\n\nDo you deliver on Sunday?\nNo, Monday to Saturday.\n\nOrphan question");
    expect(faqs).toEqual([
      { q: "Are they original?", a: "Yes, all original." },
      { q: "Do you deliver on Sunday?", a: "No, Monday to Saturday." },
    ]);
    expect(parseFaqs(faqsToText(faqs))).toEqual(faqs);
  });
  it("knows when the 24h window is open", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(windowOpen("2026-11-08T00:00:00Z", now)).toBe(true);
    expect(windowOpen("2026-11-07T11:00:00Z", now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
  });
  it("finds the start of the day in Lagos", () => {
    expect(lagosStartOfDay(new Date("2026-11-08T23:30:00Z")).toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(lagosStartOfDay(new Date("2026-11-08T10:00:00Z")).toISOString()).toBe("2026-11-07T23:00:00.000Z");
  });
  it("ranks product search results by name matches first", () => {
    const rows = [
      { name: "Running Trainers", description: "grey white sole", category: "Sneakers", tags: [] },
      { name: "Classic White Sneakers", description: "", category: "Sneakers", tags: ["white"] },
    ];
    expect(rankProducts(rows, searchWords("white sneakers"))[0].name).toBe("Classic White Sneakers");
    expect(searchWords("I want  RED heels, size 39!")).toEqual(["want", "red", "heels", "size", "39"]);
  });
});
