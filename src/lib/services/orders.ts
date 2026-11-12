// Orders: creation with stock checks, payment links, paid handling and status updates.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { initializeTransaction, placeholderEmail } from "../paystack";
import { formatNaira } from "../money";
import { enqueue } from "../jobs";
import { env } from "../env";
import type { Order, OrderItem, OrderStatus } from "../types";
import type { NewOrderInput, OrderSummary } from "../ai/store";
import { paystackKey, getVendor } from "./vendor";
import { sendToOrderCustomer } from "./messaging";
import { alertVendor, audit } from "./notify";

export async function createOrder(
  db: SupabaseClient,
  ctx: { vendorId: string; customerId: string | null; conversationId: string | null },
  input: NewOrderInput,
): Promise<OrderSummary> {
  // place_order checks and reserves stock, numbers the order and totals it in one transaction.
  const { data, error } = await db.rpc("place_order", {
    p_vendor: ctx.vendorId,
    p_customer: ctx.customerId,
    p_conversation: ctx.conversationId,
    p_items: input.items,
    p_zone: input.delivery_zone_id,
    p_address: input.delivery_address,
    p_name: input.customer_name,
    p_phone: input.customer_phone,
    p_notes: input.notes ?? null,
  });
  if (error || !data) throw new Error(error?.message ?? "Could not create order");
  const order = data as Order;
  const { data: items } = await db.from("order_items").select("name, variant_label, quantity").eq("order_id", order.id);

  await audit(db, ctx.vendorId, "order_created", "order", order.id, { number: order.number, total: order.total_kobo });
  await enqueue("sheet.sync", { orderId: order.id });
  // Unpaid orders hold stock, so they are released after two days.
  await enqueue("order.expire", { orderId: order.id }, { runAt: new Date(Date.now() + UNPAID_HOLD_HOURS * 3600_000), dedupeKey: `once:expire:${order.id}` });
  return {
    id: order.id, number: order.number, status: order.status, total_kobo: order.total_kobo,
    payment_method: null, created_at: order.created_at, items: items ?? [],
  };
}

export const UNPAID_HOLD_HOURS = 48;

/** Cancels an order nobody paid for, which puts its stock back on sale. Pay-on-delivery orders are left alone. */
export async function expireUnpaidOrder(db: SupabaseClient, orderId: string) {
  const { data: o } = await db.from("orders").select("status, payment_method, paid_at").eq("id", orderId).single();
  if (!o || o.paid_at || o.payment_method === "cod" || !["pending", "awaiting_payment"].includes(o.status)) return;
  const { data: proof } = await db.from("payments").select("id").eq("order_id", orderId).eq("method", "transfer").eq("status", "pending").limit(1);
  if (proof?.length) return; // a transfer receipt is waiting for the vendor to confirm
  await updateOrderStatus(db, orderId, "cancelled", null);
}

async function scheduleReminders(orderId: string) {
  // Reminders at 2 hours and 20 hours (still inside WhatsApp's 24h window if they messaged recently).
  const now = Date.now();
  await enqueue("order.reminder", { orderId, n: 1 }, { runAt: new Date(now + 2 * 3600_000), dedupeKey: `once:remind:${orderId}:1` });
  await enqueue("order.reminder", { orderId, n: 2 }, { runAt: new Date(now + 20 * 3600_000), dedupeKey: `once:remind:${orderId}:2` });
}

export async function createPaymentLink(db: SupabaseClient, orderId: string): Promise<{ url: string } | { error: string }> {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!order) return { error: "Order not found" };
  if (order.paid_at) return { error: "Order is already paid" };
  if (!["pending", "awaiting_payment"].includes(order.status)) return { error: `Order is already ${order.status}` };

  const { data: existing } = await db
    .from("payments").select("authorization_url").eq("order_id", orderId).eq("method", "paystack").eq("status", "pending")
    .not("authorization_url", "is", null).limit(1).maybeSingle();
  if (existing?.authorization_url) return { url: existing.authorization_url };

  const vendor = await getVendor(db, order.vendor_id);
  const key = paystackKey(vendor);
  if (!key) return { error: "Card payment is not set up for this business. Offer bank transfer instead." };

  const reference = `SP${order.number}-${randomBytes(6).toString("hex")}`;
  const { authorization_url } = await initializeTransaction(key, {
    email: placeholderEmail(order.customer_phone || order.id),
    amountKobo: order.total_kobo,
    reference,
    callbackUrl: `${env.appUrl}/paid/${order.id}`,
    metadata: { order_id: order.id, vendor_id: order.vendor_id, order_number: order.number },
  });
  await db.from("payments").insert({
    vendor_id: order.vendor_id, order_id: order.id, method: "paystack", reference,
    amount_kobo: order.total_kobo, status: "pending", authorization_url,
  });
  await db.from("orders").update({ status: "awaiting_payment", payment_method: "paystack" }).eq("id", order.id);
  await scheduleReminders(order.id);
  return { url: authorization_url };
}

export async function chooseTransfer(db: SupabaseClient, orderId: string) {
  await db.from("orders").update({ status: "awaiting_payment", payment_method: "transfer" })
    .eq("id", orderId).in("status", ["pending", "awaiting_payment"]);
  await scheduleReminders(orderId);
}

/** Marks an order paid (idempotent) and runs the after-payment work once. */
export async function markPaid(
  db: SupabaseClient, orderId: string, method: "paystack" | "transfer" | "cod", reference: string,
  amountKobo: number, confirmedBy?: string | null, raw?: unknown,
) {
  const { data: changed, error } = await db.rpc("mark_order_paid", {
    p_order_id: orderId, p_method: method, p_reference: reference, p_amount_kobo: amountKobo,
    p_confirmed_by: confirmedBy ?? null, p_raw: raw ?? null,
  });
  if (error) throw new Error(`mark_order_paid: ${error.message}`);
  if (changed) await enqueue("order.paid", { orderId }, { dedupeKey: `once:paid:${orderId}` });
  return Boolean(changed);
}

/** After-payment work: receipt to customer, alert to vendor, low-stock check, sheet sync. */
export async function afterPaid(db: SupabaseClient, orderId: string) {
  const { data: order } = await db.from("orders").select("*, items:order_items(*)").eq("id", orderId)
    .single<Order & { items: OrderItem[] }>();
  if (!order) return;
  const vendor = await getVendor(db, order.vendor_id);
  const lines = order.items.map((i) => `${i.quantity} x ${i.name}${i.variant_label ? ` (${i.variant_label})` : ""} - ${formatNaira(i.unit_price_kobo * i.quantity)}`);

  await sendToOrderCustomer(db, order.conversation_id,
    `Payment received, thank you! 🎉\n\n*Receipt - ${vendor.name}*\nOrder #${order.number}\n${lines.join("\n")}\nDelivery: ${formatNaira(order.delivery_fee_kobo)}\n*Total paid: ${formatNaira(order.total_kobo)}*\n\nWe'll let you know when it's on the way.`);

  await alertVendor(db, order.vendor_id,
    `New paid order #${order.number}: ${formatNaira(order.total_kobo)} from ${order.customer_name ?? "a customer"}. ${lines.join("; ")}. Deliver to: ${order.delivery_address ?? "-"}`);

  const variantIds = order.items.map((i) => i.variant_id).filter(Boolean) as string[];
  if (variantIds.length) {
    const { data: low } = await db.from("product_variants").select("label, stock, product:products(name)")
      .in("id", variantIds).lte("stock", vendor.low_stock_threshold);
    for (const v of (low ?? []) as unknown as { label: string; stock: number; product: { name: string } }[]) {
      await alertVendor(db, order.vendor_id, `Low stock: ${v.product.name} (${v.label}) has ${v.stock} left.`);
    }
  }
  await enqueue("sheet.sync", { orderId });
}

const CUSTOMER_UPDATE: Partial<Record<OrderStatus, (o: Order) => string>> = {
  packed: (o) => `Your order #${o.number} has been packed and will be sent out soon. 📦`,
  out_for_delivery: (o) => `Your order #${o.number} is on the way! 🛵${o.rider_name ? ` Your rider is ${o.rider_name}${o.rider_phone ? ` (${o.rider_phone})` : ""}.` : ""}`,
  delivered: (o) => `Your order #${o.number} has been delivered. Thank you for shopping with us! 🙏`,
  cancelled: (o) => `Your order #${o.number} has been cancelled. If this is a mistake, just reply here.`,
};

export async function updateOrderStatus(
  db: SupabaseClient, orderId: string, status: OrderStatus, actorId?: string | null,
) {
  const { data: before } = await db.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!before) throw new Error("Order not found");
  // Pay on delivery: delivered means the cash was collected.
  if (status === "delivered" && !before.paid_at && before.payment_method === "cod") {
    await markPaid(db, orderId, "cod", `COD-${orderId.slice(0, 8)}-${Date.now().toString(36)}`, before.total_kobo, actorId, { via: "delivered" });
  }
  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { data: order, error } = await db.from("orders").update(patch).eq("id", orderId).select("*").single<Order>();
  if (error || !order) throw new Error(`Could not update order: ${error?.message}`);
  await audit(db, order.vendor_id, "order_status", "order", orderId, { status }, actorId);
  const message = before.status === status ? null : CUSTOMER_UPDATE[status]?.(order);
  if (message) await enqueue("order.notify", { orderId, text: message });
  if (status === "delivered") {
    // Feedback request the next day (inside the window if the customer replied to the delivery message).
    await enqueue("order.feedback", { orderId }, { runAt: new Date(Date.now() + 20 * 3600_000), dedupeKey: `once:feedback:${orderId}` });
  }
  await enqueue("sheet.sync", { orderId });
  return order;
}
