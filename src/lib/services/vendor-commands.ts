// Vendors manage their shop by WhatsApp, messaging the platform number:
//   CONFIRM 1042 · REJECT 1042 · ORDERS · PAUSE · RESUME · HELP
//   or plain language: "price of red heels is 18000", "white sneakers size 42 stock 6"
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../channels/whatsapp";
import type { InboundMessage } from "../channels/types";
import { env } from "../env";
import { formatNaira, parseNairaToKobo } from "../money";
import { costMicros } from "../ai/models";
import type { Vendor } from "../types";
import { audit } from "./notify";
import { markPaid } from "./orders";
import { sendToOrderCustomer } from "./messaging";
import { dailySummaryText } from "./reports";
import { notifyRestock } from "./growth";

const HELP = `SalesPadi commands:
CONFIRM 1042 - confirm a bank transfer for order 1042
REJECT 1042 - payment not received for order 1042
ORDERS - today's summary
PAUSE / RESUME - stop or start the AI replies
Or just type changes, e.g. "price of red heels is 18000" or "white sneakers size 42 stock 6".`;

export async function handleVendorCommand(db: SupabaseClient, msg: InboundMessage) {
  const from = msg.customerExternalId.replace(/\D/g, "");
  const { data: vendors } = await db.from("vendors").select("*").eq("owner_whatsapp", from);
  const reply = async (text: string) =>
    sendWhatsApp(env.platformWaPhoneNumberId, env.platformWaAccessToken, from, { kind: "text", text });

  if (!vendors?.length) {
    await reply("Hi! This number is for SalesPadi vendors. If you're a vendor, ask your SalesPadi manager to add this WhatsApp number to your account.");
    return;
  }
  const vendor = vendors[0] as Vendor;
  await audit(db, vendor.id, "vendor_command", undefined, undefined, { text: msg.text });
  const text = msg.text.trim();
  const [cmd, arg] = text.split(/\s+/);

  switch (cmd?.toUpperCase()) {
    case "HELP":
      return reply(HELP);
    case "PAUSE":
      await db.from("vendors").update({ ai_enabled: false }).eq("id", vendor.id);
      return reply("AI replies are paused. New chats will wait for you in SalesPadi. Send RESUME to turn them back on.");
    case "RESUME":
      await db.from("vendors").update({ ai_enabled: true }).eq("id", vendor.id);
      return reply("AI replies are back on. ✅");
    case "ORDERS":
    case "SUMMARY":
      return reply(await dailySummaryText(db, vendor));
    case "CONFIRM":
    case "REJECT": {
      const number = Number(arg);
      const { data: order } = await db.from("orders").select("id, number, total_kobo, conversation_id, status")
        .eq("vendor_id", vendor.id).eq("number", number).maybeSingle();
      if (!order) return reply(`I can't find order ${arg ?? ""} for ${vendor.name}.`);
      const { data: payment } = await db.from("payments").select("*").eq("order_id", order.id).eq("method", "transfer")
        .eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cmd.toUpperCase() === "CONFIRM") {
        const changed = await markPaid(db, order.id, "transfer", payment?.reference ?? `TRF${order.number}-manual`, order.total_kobo, null, { via: "whatsapp_command" });
        return reply(changed ? `Order #${order.number} marked paid (${formatNaira(order.total_kobo)}). The customer has been told.` : `Order #${order.number} is already ${order.status}.`);
      }
      if (payment) await db.from("payments").update({ status: "rejected" }).eq("id", payment.id);
      await sendToOrderCustomer(db, order.conversation_id,
        `We haven't received the transfer for order #${order.number} yet. Please check and send the correct receipt, or reply here if you need help.`);
      return reply(`OK, I told the customer the payment for #${order.number} hasn't arrived.`);
    }
  }
  return reply(await catalogEdit(db, vendor, text));
}

/** Natural-language price and stock edits, using a small tool loop on the routine model. */
async function catalogEdit(db: SupabaseClient, vendor: Vendor, text: string): Promise<string> {
  const client = new Anthropic();
  const tools: Anthropic.Tool[] = [
    {
      name: "find_products", description: "Search the vendor's catalog. Returns products with option ids, labels, prices and stock.",
      input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }, strict: true,
    },
    {
      name: "update_option", description: "Change the price (naira, e.g. '18000' or '18k') and/or stock of one product option. Use '' for a field you are not changing.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["variant_id", "price", "stock"],
        properties: { variant_id: { type: "string" }, price: { type: "string" }, stock: { type: "string" } },
      }, strict: true,
    },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];
  const changes: string[] = [];
  let answer = "";
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: env.aiModelRoutine, max_tokens: 2048, tools, messages, output_config: { effort: "low" },
      system: `You update the product catalog for ${vendor.name} from the owner's WhatsApp messages. Find the product, then update price and/or stock. If the message is ambiguous (several matching products or options), don't change anything; ask which one. If it isn't a catalog change, reply with: ${HELP.replace(/\n/g, " ")} Reply in one or two short sentences.`,
    });
    await db.from("ai_usage").insert({ vendor_id: vendor.id, model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, cost_usd_micros: costMicros(res.model, res.usage) });
    messages.push({ role: "assistant", content: res.content });
    answer = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") || answer;
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = u.input as Record<string, string>;
      let out: unknown;
      if (u.name === "find_products") {
        const { data } = await db.from("products").select("id, name, variants:product_variants(id, label, price_kobo, stock)")
          .eq("vendor_id", vendor.id).ilike("name", `%${input.query.split(/\s+/)[0] ?? ""}%`).limit(10);
        out = data ?? [];
      } else {
        const patch: Record<string, number> = {};
        const price = input.price ? parseNairaToKobo(input.price) : null;
        if (price !== null) patch.price_kobo = price;
        if (input.stock !== "" && Number.isInteger(Number(input.stock))) patch.stock = Math.max(0, Number(input.stock));
        const { data, error } = await db.from("product_variants").update(patch).eq("vendor_id", vendor.id).eq("id", input.variant_id)
          .select("id, label, price_kobo, stock, product:products(name)").single();
        if (error || !data) out = { error: error?.message ?? "not found" };
        else {
          const d = data as unknown as { id: string; label: string; price_kobo: number; stock: number; product: { name: string } };
          changes.push(`${d.product.name} (${d.label}): ${formatNaira(d.price_kobo)}, ${d.stock} in stock`);
          await audit(db, vendor.id, "catalog_edit_whatsapp", "variant", d.id, patch);
          if (patch.stock && patch.stock > 0) await notifyRestock(db, vendor.id, d.id);
          out = { ok: true, updated: d };
        }
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return changes.length ? `Updated ✅\n${changes.join("\n")}` : answer || HELP;
}
