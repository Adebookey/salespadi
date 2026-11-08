// The agent's tools. Every fact the agent tells a customer (price, stock, fee, order status) comes from here.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatNaira } from "../money";
import type { AgentStore } from "./store";

type Tool = Anthropic.Beta.BetaTool;

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });

export const TOOLS: Tool[] = [
  {
    name: "search_products",
    description: "Search this business's catalog by keywords (product type, colour, style, occasion, size). Returns matching products with price range and the options currently in stock.",
    input_schema: obj({ query: str("Keywords, e.g. 'white sneakers' or 'red heels 39'") }),
    strict: true,
  },
  {
    name: "get_product",
    description: "Full details for one product: description, every option (size/colour) with its price and stock, and photo URLs.",
    input_schema: obj({ product_id: str("Product id from search_products") }),
    strict: true,
  },
  {
    name: "check_stock",
    description: "Current stock for each option of a product. Use right before confirming an order.",
    input_schema: obj({ product_id: str("Product id") }),
    strict: true,
  },
  {
    name: "send_product_photos",
    description: "Send the product's photos to the customer, each captioned with the name and price. Use when they ask to see an item.",
    input_schema: obj({ product_id: str("Product id"), max_photos: { type: "integer", description: "1 to 4" } }),
    strict: true,
  },
  {
    name: "get_delivery_fee",
    description: "Find the delivery zone, fee and delivery time for the customer's area or address.",
    input_schema: obj({ area: str("Area, city or full address, e.g. 'Lekki Phase 1'") }),
    strict: true,
  },
  {
    name: "save_customer_details",
    description: "Save the customer's name, phone number and/or delivery address as soon as they share them. Pass an empty string for anything not given.",
    input_schema: obj({ name: str("Full name or ''"), phone: str("Phone number or ''"), address: str("Delivery address or ''") }),
    strict: true,
  },
  {
    name: "create_order",
    description: "Create the order after the customer has confirmed items, total and delivery details. Returns the order number and total.",
    input_schema: obj({
      items: {
        type: "array",
        items: obj({ variant_id: str("Option id from get_product"), quantity: { type: "integer" } }),
      },
      delivery_zone_id: str("Zone id from get_delivery_fee"),
      delivery_address: str("Full delivery address"),
      customer_name: str("Customer's full name"),
      customer_phone: str("Customer's phone number"),
      notes: str("Anything the vendor should know, or ''"),
    }),
    strict: true,
  },
  {
    name: "create_payment_link",
    description: "Create a Paystack payment link for an order so the customer can pay by card, bank or USSD.",
    input_schema: obj({ order_id: str("Order id from create_order or get_order_status") }),
    strict: true,
  },
  {
    name: "choose_bank_transfer",
    description: "Record that the customer will pay by bank transfer. Then share the bank details from your instructions and ask for a screenshot of the receipt.",
    input_schema: obj({ order_id: str("Order id") }),
    strict: true,
  },
  {
    name: "choose_pay_on_delivery",
    description: "Record that the customer will pay on delivery, if the business allows it.",
    input_schema: obj({ order_id: str("Order id") }),
    strict: true,
  },
  {
    name: "record_transfer_proof",
    description: "The customer just sent a screenshot or photo of a bank transfer receipt: attach it to their order. The vendor confirms it; do not tell the customer the payment is confirmed.",
    input_schema: obj({ order_id: str("Order id") }),
    strict: true,
  },
  {
    name: "get_order_status",
    description: "This customer's recent orders with status, items and totals.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "request_restock_alert",
    description: "Notify this customer when a sold-out product (or one option of it) is back in stock.",
    input_schema: obj({ product_id: str("Product id"), variant_id: str("Option id, or '' for any option") }),
    strict: true,
  },
  {
    name: "set_broadcast_opt_in",
    description: "Record whether the customer wants to hear about new stock and promos. Only when they clearly say yes or no.",
    input_schema: obj({ opt_in: { type: "boolean" } }),
    strict: true,
  },
  {
    name: "handoff_to_human",
    description: "Pause the assistant and alert the business team to take over this chat. Use when unsure, for complaints, refunds, custom or bulk requests, discounts, or when the customer asks for a person.",
    input_schema: obj({ reason: str("Short reason for the team, e.g. 'Customer wants refund for order 1042'") }),
    strict: true,
  },
];

const schemas = {
  search_products: z.object({ query: z.string() }),
  get_product: z.object({ product_id: z.string() }),
  check_stock: z.object({ product_id: z.string() }),
  send_product_photos: z.object({ product_id: z.string(), max_photos: z.number().int() }),
  get_delivery_fee: z.object({ area: z.string() }),
  save_customer_details: z.object({ name: z.string(), phone: z.string(), address: z.string() }),
  create_order: z.object({
    items: z.array(z.object({ variant_id: z.string(), quantity: z.number().int().positive() })).min(1),
    delivery_zone_id: z.string(),
    delivery_address: z.string().min(3),
    customer_name: z.string().min(2),
    customer_phone: z.string().min(7),
    notes: z.string(),
  }),
  create_payment_link: z.object({ order_id: z.string() }),
  choose_bank_transfer: z.object({ order_id: z.string() }),
  choose_pay_on_delivery: z.object({ order_id: z.string() }),
  record_transfer_proof: z.object({ order_id: z.string() }),
  get_order_status: z.object({}),
  request_restock_alert: z.object({ product_id: z.string(), variant_id: z.string() }),
  set_broadcast_opt_in: z.object({ opt_in: z.boolean() }),
  handoff_to_human: z.object({ reason: z.string() }),
} as const;

export type ToolName = keyof typeof schemas;

export interface ToolContext {
  store: AgentStore;
  /** Photos to send after the text reply. */
  outbox: { url: string; caption: string }[];
  handedOff: boolean;
  handoffReason?: string;
  orderCreated?: string;
}

/** Matches the customer's area to a zone by area name, zone name, then a loose word match. */
export function matchZone<T extends { name: string; areas: string[] }>(zones: T[], area: string): T | undefined {
  const a = area.toLowerCase();
  const has = (s: string) => a.includes(s.toLowerCase());
  return (
    zones.find((z) => z.areas.some(has)) ??
    zones.find((z) => has(z.name)) ??
    zones.find((z) => z.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && a.includes(w)))
  );
}

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in schemas)) throw new Error(`Unknown tool ${name}`);
  const input: unknown = schemas[name as ToolName].parse(rawInput);
  const { store } = ctx;

  switch (name as ToolName) {
    case "search_products": {
      const { query } = input as { query: string };
      const results = await store.searchProducts(query, 6);
      if (!results.length) return { results: [], note: "No match. Try other words, or broader ones." };
      return {
        results: results.map((p) => ({
          ...p,
          price: p.min_price_kobo === p.max_price_kobo
            ? formatNaira(p.min_price_kobo)
            : `${formatNaira(p.min_price_kobo)} - ${formatNaira(p.max_price_kobo)}`,
        })),
      };
    }
    case "get_product":
    case "check_stock": {
      const p = await store.getProduct((input as { product_id: string }).product_id);
      if (!p) return { error: "Product not found" };
      const variants = p.variants.map((v) => ({
        variant_id: v.id, option: v.label, price: formatNaira(v.price_kobo), stock: v.stock,
        available: v.stock > 0,
      }));
      return name === "check_stock"
        ? { product: p.name, options: variants }
        : { id: p.id, name: p.name, description: p.description, category: p.category, options: variants, photo_count: p.images.length };
    }
    case "send_product_photos": {
      const { product_id, max_photos } = input as { product_id: string; max_photos: number };
      const p = await store.getProduct(product_id);
      if (!p) return { error: "Product not found" };
      if (!p.images.length) return { error: "This product has no photos yet. Describe it instead." };
      const prices = p.variants.map((v) => v.price_kobo);
      const price = prices.length ? formatNaira(Math.min(...prices)) : "";
      const n = Math.min(Math.max(max_photos, 1), 4);
      p.images.slice(0, n).forEach((url) => ctx.outbox.push({ url, caption: `${p.name}${price ? ` - ${price}` : ""}` }));
      return { sent: Math.min(n, p.images.length), note: "Photos will be sent right after your text reply." };
    }
    case "get_delivery_fee": {
      const { area } = input as { area: string };
      const zones = await store.deliveryZones();
      const zone = matchZone(zones, area);
      if (!zone) {
        return {
          found: false,
          zones: zones.map((z) => ({ zone_id: z.id, name: z.name, fee: formatNaira(z.fee_kobo), areas: z.areas })),
          note: "Ask which of these zones fits the customer's area. If none, hand off.",
        };
      }
      return { found: true, zone_id: zone.id, zone: zone.name, fee: formatNaira(zone.fee_kobo), fee_kobo: zone.fee_kobo, eta: zone.eta };
    }
    case "save_customer_details": {
      const { name: n, phone, address } = input as { name: string; phone: string; address: string };
      await store.saveCustomerDetails({ name: n || undefined, phone: phone || undefined, address: address || undefined });
      return { saved: true };
    }
    case "create_order": {
      const i = input as z.infer<typeof schemas.create_order>;
      try {
        const order = await store.createOrder({ ...i, notes: i.notes || undefined });
        ctx.orderCreated = order.id;
        return {
          order_id: order.id,
          order_number: order.number,
          total: formatNaira(order.total_kobo),
          items: order.items,
          next: "Ask how they want to pay, using the payment options in your instructions.",
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Could not create order" };
      }
    }
    case "create_payment_link": {
      const r = await store.createPaymentLink((input as { order_id: string }).order_id);
      return "url" in r ? { payment_url: r.url, note: "Send this link. The order is marked paid automatically once payment goes through." } : r;
    }
    case "choose_bank_transfer": {
      await store.chooseTransfer((input as { order_id: string }).order_id);
      const v = await store.vendor();
      return v.bank ? { ok: true, bank: v.bank } : { error: "No bank details set. Offer another option or hand off." };
    }
    case "choose_pay_on_delivery":
      return store.chooseCashOnDelivery((input as { order_id: string }).order_id);
    case "record_transfer_proof":
      return store.recordTransferProof((input as { order_id: string }).order_id);
    case "get_order_status": {
      const orders = await store.customerOrders();
      return { orders: orders.map((o) => ({ ...o, total: formatNaira(o.total_kobo) })) };
    }
    case "request_restock_alert": {
      const { product_id, variant_id } = input as { product_id: string; variant_id: string };
      await store.requestRestockAlert(product_id, variant_id || undefined);
      return { ok: true };
    }
    case "set_broadcast_opt_in":
      await store.setBroadcastOptIn((input as { opt_in: boolean }).opt_in);
      return { ok: true };
    case "handoff_to_human": {
      const { reason } = input as { reason: string };
      await store.handoff(reason);
      ctx.handedOff = true;
      ctx.handoffReason = reason;
      return { ok: true, note: "Tell the customer a team member will reply shortly. Don't try to solve it further." };
    }
  }
}
