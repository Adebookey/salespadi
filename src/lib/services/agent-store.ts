// AgentStore backed by Supabase, scoped to one vendor + customer + conversation. Uses the service-role client,
// so every query filters by vendor_id explicitly.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentStore, NewOrderInput, OrderSummary, ProductDetail, ProductSummary, VendorProfile } from "../ai/store";
import type { DeliveryZone } from "../types";
import { getSettings, getVendor, toProfile } from "./vendor";
import * as orders from "./orders";
import { alertVendor, audit } from "./notify";

interface Row {
  id: string; name: string; description: string; category: string | null; tags: string[];
  variants: { id: string; label: string; size: string | null; colour: string | null; price_kobo: number; stock: number }[];
  images: { url: string; position: number }[];
}

const SELECT = "id, name, description, category, tags, variants:product_variants(id, label, size, colour, price_kobo, stock), images:product_images(url, position)";

export function searchWords(query: string) {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).slice(0, 8);
}

export function rankProducts<T extends { name: string; description: string; category: string | null; tags: string[] }>(rows: T[], words: string[]) {
  return rows
    .map((p) => {
      const hay = `${p.name} ${p.description} ${p.category ?? ""} ${p.tags.join(" ")}`.toLowerCase();
      const name = p.name.toLowerCase();
      const score = words.reduce((s, w) => s + (name.includes(w) ? 3 : 0) + (hay.includes(w) ? 1 : 0), 0);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

export function summarise(p: Row): ProductSummary {
  const prices = p.variants.map((v) => v.price_kobo);
  const inStock = p.variants.filter((v) => v.stock > 0);
  return {
    id: p.id, name: p.name, category: p.category,
    min_price_kobo: prices.length ? Math.min(...prices) : 0,
    max_price_kobo: prices.length ? Math.max(...prices) : 0,
    in_stock_options: inStock.map((v) => v.label),
    sold_out: inStock.length === 0,
  };
}

export class SupabaseAgentStore implements AgentStore {
  private profile?: VendorProfile;

  constructor(
    private db: SupabaseClient,
    private ids: { vendorId: string; customerId: string | null; conversationId: string | null },
    /** Storage path of the customer's most recent image in this turn, for transfer proofs. */
    private latestImagePath: string | null = null,
  ) {}

  async vendor() {
    this.profile ??= toProfile(await getVendor(this.db, this.ids.vendorId), await getSettings(this.db, this.ids.vendorId));
    return this.profile;
  }

  async deliveryZones(): Promise<DeliveryZone[]> {
    const { data } = await this.db.from("delivery_zones").select("*").eq("vendor_id", this.ids.vendorId).order("fee_kobo");
    return (data ?? []) as DeliveryZone[];
  }

  async searchProducts(query: string, limit = 6): Promise<ProductSummary[]> {
    const words = searchWords(query);
    if (!words.length) return [];
    const tsquery = words.map((w) => `${w}:*`).join(" | ");
    let { data } = await this.db.from("products").select(SELECT)
      .eq("vendor_id", this.ids.vendorId).eq("is_active", true)
      .textSearch("search", tsquery, { config: "simple" }).limit(40);
    if (!data?.length) {
      ({ data } = await this.db.from("products").select(SELECT)
        .eq("vendor_id", this.ids.vendorId).eq("is_active", true)
        .or(words.map((w) => `name.ilike.*${w}*`).join(",")).limit(40));
    }
    return rankProducts((data ?? []) as Row[], words).slice(0, limit).map(summarise);
  }

  async getProduct(productId: string): Promise<ProductDetail | null> {
    const { data } = await this.db.from("products").select(SELECT)
      .eq("vendor_id", this.ids.vendorId).eq("id", productId).eq("is_active", true).maybeSingle();
    if (!data) return null;
    const p = data as Row;
    return {
      id: p.id, name: p.name, description: p.description, category: p.category,
      images: [...p.images].sort((a, b) => a.position - b.position).map((i) => i.url),
      variants: p.variants,
    };
  }

  async createOrder(input: NewOrderInput): Promise<OrderSummary> {
    await this.saveCustomerDetails({ name: input.customer_name, phone: input.customer_phone, address: input.delivery_address });
    return orders.createOrder(this.db, this.ids, input);
  }

  private async ownOrder(orderId: string) {
    const { data } = await this.db.from("orders").select("id, number, status, payment_method")
      .eq("vendor_id", this.ids.vendorId).eq("id", orderId).maybeSingle();
    if (!data) return null;
    if (this.ids.customerId) {
      const { data: owned } = await this.db.from("orders").select("id").eq("id", orderId).eq("customer_id", this.ids.customerId).maybeSingle();
      if (!owned) return null;
    }
    return data;
  }

  async createPaymentLink(orderId: string) {
    if (!(await this.ownOrder(orderId))) return { error: "Order not found" };
    return orders.createPaymentLink(this.db, orderId);
  }

  async chooseTransfer(orderId: string) {
    if (await this.ownOrder(orderId)) await orders.chooseTransfer(this.db, orderId);
  }

  async chooseCashOnDelivery(orderId: string) {
    const o = await this.ownOrder(orderId);
    if (!o) return { ok: false, reason: "Order not found" };
    if (!(await this.vendor()).pay_on_delivery) return { ok: false, reason: "This business does not accept pay on delivery." };
    await this.db.from("orders").update({ payment_method: "cod" }).eq("id", orderId);
    await alertVendor(this.db, this.ids.vendorId, `Order #${o.number} will be paid on delivery. Please confirm and schedule it.`);
    return { ok: true };
  }

  async customerOrders(): Promise<OrderSummary[]> {
    if (!this.ids.customerId) return [];
    const { data } = await this.db.from("orders")
      .select("id, number, status, total_kobo, payment_method, created_at, items:order_items(name, variant_label, quantity)")
      .eq("vendor_id", this.ids.vendorId).eq("customer_id", this.ids.customerId)
      .order("created_at", { ascending: false }).limit(5);
    return (data ?? []) as OrderSummary[];
  }

  async recordTransferProof(orderId: string) {
    const o = await this.ownOrder(orderId);
    if (!o) return { ok: false, reason: "Order not found" };
    if (!this.latestImagePath) return { ok: false, reason: "No image received in this message. Ask the customer to send the receipt screenshot." };
    const { data: order } = await this.db.from("orders").select("total_kobo").eq("id", orderId).single();
    await this.db.from("payments").insert({
      vendor_id: this.ids.vendorId, order_id: orderId, method: "transfer",
      reference: `TRF${o.number}-${Date.now().toString(36)}`, amount_kobo: order?.total_kobo ?? 0,
      status: "pending", proof_url: this.latestImagePath,
    });
    await this.db.from("orders").update({ status: "awaiting_payment", payment_method: "transfer" }).eq("id", orderId)
      .in("status", ["pending", "awaiting_payment"]);
    await alertVendor(this.db, this.ids.vendorId,
      `Transfer proof received for order #${o.number}. Check your bank, then confirm it in SalesPadi or reply "CONFIRM ${o.number}".`);
    return { ok: true };
  }

  async saveCustomerDetails(d: { name?: string; phone?: string; address?: string }) {
    if (!this.ids.customerId) return;
    const patch = Object.fromEntries(Object.entries(d).filter(([, v]) => v));
    if (Object.keys(patch).length) await this.db.from("customers").update(patch).eq("id", this.ids.customerId);
  }

  async requestRestockAlert(productId: string, variantId?: string) {
    if (!this.ids.customerId) return;
    await this.db.from("restock_requests").insert({
      vendor_id: this.ids.vendorId, customer_id: this.ids.customerId, product_id: productId, variant_id: variantId ?? null,
    });
  }

  async setBroadcastOptIn(optIn: boolean) {
    if (this.ids.customerId) await this.db.from("customers").update({ opted_in_broadcast: optIn }).eq("id", this.ids.customerId);
  }

  async handoff(reason: string) {
    if (!this.ids.conversationId) return;
    await this.db.from("conversations")
      .update({ status: "human", needs_attention: true, handoff_reason: reason })
      .eq("id", this.ids.conversationId);
    await audit(this.db, this.ids.vendorId, "handoff", "conversation", this.ids.conversationId, { reason });
    await alertVendor(this.db, this.ids.vendorId, `A customer needs you: ${reason}. Open SalesPadi to reply.`);
  }
}
