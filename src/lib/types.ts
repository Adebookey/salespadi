// Row shapes for the tables in supabase/migrations. Keep in sync with the schema.
export type MemberRole = "owner" | "staff" | "operator";
export type ChannelType = "whatsapp" | "instagram";
export type ConversationStatus = "ai" | "human" | "closed";
export type OrderStatus =
  | "pending" | "awaiting_payment" | "paid" | "packed" | "out_for_delivery" | "delivered" | "cancelled";
export type PaymentMethod = "paystack" | "transfer" | "cod";

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  status: "onboarding" | "live" | "paused";
  ai_enabled: boolean;
  city: string | null;
  instagram_handle: string | null;
  business_phone: string | null;
  owner_whatsapp: string | null;
  google_sheet_id: string | null;
  paystack_secret_enc: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  pay_on_delivery: boolean;
  low_stock_threshold: number;
  setup_fee_kobo: number;
  monthly_fee_kobo: number;
  next_billing_date: string | null;
  created_at: string;
}

export interface Faq { q: string; a: string }

export interface VendorSettings {
  vendor_id: string;
  tone: string;
  pidgin_enabled: boolean;
  sample_replies: string[];
  greeting: string | null;
  policies: string;
  faqs: Faq[];
  handoff_rules: string;
  business_hours: { open: string; close: string; days: number[] };
  followup_enabled: boolean;
}

export interface Channel {
  id: string;
  vendor_id: string;
  type: ChannelType;
  external_id: string;
  display_name: string | null;
  waba_id: string | null;
  access_token_enc: string | null;
  status: "pending" | "active" | "disabled" | "error";
}

export interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  is_active: boolean;
  source_post_id: string | null;
  created_at: string;
}

export interface Variant {
  id: string;
  vendor_id: string;
  product_id: string;
  label: string;
  size: string | null;
  colour: string | null;
  sku: string | null;
  price_kobo: number;
  stock: number;
}

export interface ProductImage { id: string; product_id: string; url: string; storage_path: string | null; position: number }

export interface DeliveryZone {
  id: string;
  vendor_id: string;
  name: string;
  areas: string[];
  fee_kobo: number;
  eta: string | null;
}

export interface Customer {
  id: string;
  vendor_id: string;
  channel_type: ChannelType;
  external_user_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  opted_in_broadcast: boolean;
  last_inbound_at: string | null;
}

export interface Conversation {
  id: string;
  vendor_id: string;
  customer_id: string;
  channel_id: string | null;
  channel_type: ChannelType;
  status: ConversationStatus;
  summary: string;
  summary_until: string | null;
  needs_attention: boolean;
  handoff_reason: string | null;
  last_message_at: string;
  last_inbound_at: string | null;
  followup_sent_at: string | null;
}

export interface Message {
  id: string;
  vendor_id: string;
  conversation_id: string;
  direction: "in" | "out";
  sender: "customer" | "ai" | "human" | "system";
  type: string;
  content: string;
  media_url: string | null;
  external_id: string | null;
  ai_meta: Record<string, unknown> | null;
  status: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  vendor_id: string;
  number: number;
  customer_id: string | null;
  conversation_id: string | null;
  status: OrderStatus;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  delivery_zone_id: string | null;
  delivery_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  payment_method: PaymentMethod | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_token: string;
  reminder_count: number;
  paid_at: string | null;
  delivered_at: string | null;
  sheet_synced_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  variant_label: string | null;
  unit_price_kobo: number;
  quantity: number;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  reference: string;
  amount_kobo: number;
  status: "pending" | "success" | "failed" | "rejected";
  authorization_url: string | null;
  proof_url: string | null;
  created_at: string;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
