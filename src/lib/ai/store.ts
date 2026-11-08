// What the agent's tools can read and change. One implementation talks to Supabase (services/agent-store.ts),
// another keeps everything in memory for tests and the offline eval (ai/memory-store.ts).
import type { DeliveryZone, Faq, OrderStatus, PaymentMethod } from "../types";

export interface ProductSummary {
  id: string;
  name: string;
  category: string | null;
  min_price_kobo: number;
  max_price_kobo: number;
  in_stock_options: string[];
  sold_out: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  category: string | null;
  images: string[];
  variants: { id: string; label: string; size: string | null; colour: string | null; price_kobo: number; stock: number }[];
}

export interface OrderSummary {
  id: string;
  number: number;
  status: OrderStatus;
  total_kobo: number;
  payment_method: PaymentMethod | null;
  items: { name: string; variant_label: string | null; quantity: number }[];
  created_at: string;
}

export interface NewOrderInput {
  items: { variant_id: string; quantity: number }[];
  delivery_zone_id: string;
  delivery_address: string;
  customer_name: string;
  customer_phone: string;
  notes?: string;
}

export interface VendorProfile {
  name: string;
  city: string | null;
  tone: string;
  pidgin_enabled: boolean;
  sample_replies: string[];
  greeting: string | null;
  policies: string;
  faqs: Faq[];
  handoff_rules: string;
  business_hours: { open: string; close: string; days: number[] };
  pay_on_delivery: boolean;
  bank: { name: string; account_name: string; account_number: string } | null;
  paystack_enabled: boolean;
}

export interface AgentStore {
  vendor(): Promise<VendorProfile>;
  searchProducts(query: string, limit?: number): Promise<ProductSummary[]>;
  getProduct(productId: string): Promise<ProductDetail | null>;
  deliveryZones(): Promise<DeliveryZone[]>;
  createOrder(input: NewOrderInput): Promise<OrderSummary>;
  /** Returns a Paystack checkout URL, or explains why it could not. */
  createPaymentLink(orderId: string): Promise<{ url: string } | { error: string }>;
  chooseTransfer(orderId: string): Promise<void>;
  chooseCashOnDelivery(orderId: string): Promise<{ ok: boolean; reason?: string }>;
  customerOrders(): Promise<OrderSummary[]>;
  /** Attaches the customer's most recent image to the order as transfer proof and alerts the vendor. */
  recordTransferProof(orderId: string): Promise<{ ok: boolean; reason?: string }>;
  saveCustomerDetails(details: { name?: string; phone?: string; address?: string }): Promise<void>;
  requestRestockAlert(productId: string, variantId?: string): Promise<void>;
  setBroadcastOptIn(optIn: boolean): Promise<void>;
  handoff(reason: string): Promise<void>;
}
