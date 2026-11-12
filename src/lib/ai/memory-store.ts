// In-memory AgentStore for unit tests and the offline eval. Mirrors the Supabase store's behaviour.
import type { AgentStore, NewOrderInput, OrderSummary, ProductDetail, ProductSummary, VendorProfile } from "./store";
import type { DeliveryZone } from "../types";

export interface MemoryCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  images: string[];
  variants: { id: string; label: string; size: string | null; colour: string | null; price_kobo: number; stock: number }[];
}

export class MemoryStore implements AgentStore {
  orders: (OrderSummary & { input: NewOrderInput; proof?: boolean })[] = [];
  handoffs: string[] = [];
  restock: { productId: string; variantId?: string }[] = [];
  customer: { name?: string; phone?: string; address?: string; optIn?: boolean } = {};
  lastImage: string | null = null;
  private seq = 1001;

  constructor(
    private profile: VendorProfile,
    public catalog: MemoryCatalogItem[],
    private zones: DeliveryZone[],
  ) {}

  /** Serialisable state so the prompt studio can carry a simulated order across turns. */
  snapshot() {
    return { orders: this.orders, handoffs: this.handoffs, restock: this.restock, customer: this.customer, seq: this.seq };
  }
  restore(s: ReturnType<MemoryStore["snapshot"]> | undefined) {
    if (!s) return;
    Object.assign(this, { orders: s.orders, handoffs: s.handoffs, restock: s.restock, customer: s.customer, seq: s.seq });
  }

  async vendor() { return this.profile; }
  async deliveryZones() { return this.zones; }

  async searchProducts(query: string, limit = 6): Promise<ProductSummary[]> {
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
    const scored = this.catalog
      .map((p) => {
        const hay = `${p.name} ${p.description} ${p.category} ${p.tags.join(" ")}`.toLowerCase();
        return { p, score: words.filter((w) => hay.includes(w) || hay.includes(w.replace(/s$/, ""))).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map(({ p }) => {
      const prices = p.variants.map((v) => v.price_kobo);
      const inStock = p.variants.filter((v) => v.stock > 0);
      return {
        id: p.id, name: p.name, category: p.category,
        min_price_kobo: Math.min(...prices), max_price_kobo: Math.max(...prices),
        in_stock_options: inStock.map((v) => v.label), sold_out: inStock.length === 0,
      };
    });
  }

  async getProduct(id: string): Promise<ProductDetail | null> {
    const p = this.catalog.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, description: p.description, category: p.category, images: p.images, variants: p.variants } : null;
  }

  async createOrder(input: NewOrderInput): Promise<OrderSummary> {
    const zone = this.zones.find((z) => z.id === input.delivery_zone_id);
    if (!zone) throw new Error("Unknown delivery zone");
    let subtotal = 0;
    const lines = input.items.map((i) => {
      const product = this.catalog.find((p) => p.variants.some((v) => v.id === i.variant_id));
      const v = product?.variants.find((x) => x.id === i.variant_id);
      if (!product || !v) throw new Error(`Option ${i.variant_id} is not available`);
      if (v.stock === 0) throw new Error(`${product.name} (${v.label}) is sold out`);
      if (v.stock < i.quantity) throw new Error(`Only ${v.stock} left of ${product.name} (${v.label})`);
      return { product, v, quantity: i.quantity };
    });
    const items = lines.map(({ product, v, quantity }) => {
      v.stock -= quantity; // stock is reserved when the order is placed
      subtotal += v.price_kobo * quantity;
      return { name: product.name, variant_label: v.label, quantity };
    });
    const order = {
      id: `order-${this.seq}`, number: this.seq++, status: "pending" as const,
      total_kobo: subtotal + zone.fee_kobo, payment_method: null, items, created_at: new Date().toISOString(), input,
    };
    this.orders.push(order);
    return order;
  }

  async createPaymentLink(orderId: string) {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return { error: "Order not found" };
    if (!this.profile.paystack_enabled) return { error: "Card payment is not set up for this business. Offer bank transfer." };
    o.status = "awaiting_payment";
    o.payment_method = "paystack";
    return { url: `https://checkout.paystack.com/test-${o.number}` };
  }

  async chooseTransfer(orderId: string) {
    const o = this.orders.find((x) => x.id === orderId);
    if (o) { o.status = "awaiting_payment"; o.payment_method = "transfer"; }
  }

  async chooseCashOnDelivery(orderId: string) {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return { ok: false, reason: "Order not found" };
    if (!this.profile.pay_on_delivery) return { ok: false, reason: "This business does not accept pay on delivery." };
    o.payment_method = "cod";
    return { ok: true };
  }

  async customerOrders() { return this.orders.map(({ input: _input, proof: _proof, ...o }) => o); }

  async recordTransferProof(orderId: string) {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return { ok: false, reason: "Order not found" };
    if (!this.lastImage) return { ok: false, reason: "No image received from the customer yet." };
    o.proof = true;
    return { ok: true };
  }

  async saveCustomerDetails(d: { name?: string; phone?: string; address?: string }) { Object.assign(this.customer, d); }
  async requestRestockAlert(productId: string, variantId?: string) { this.restock.push({ productId, variantId }); }
  async setBroadcastOptIn(optIn: boolean) { this.customer.optIn = optIn; }
  async handoff(reason: string) { this.handoffs.push(reason); }
}
