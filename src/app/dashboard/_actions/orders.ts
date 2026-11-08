"use server";
import { revalidatePath } from "next/cache";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import * as orders from "@/lib/services/orders";
import { sendToOrderCustomer } from "@/lib/services/messaging";
import { env } from "@/lib/env";
import type { OrderStatus } from "@/lib/types";
import type { ActionState } from "./vendor";

async function ownOrder(vendorId: string, orderId: string) {
  const { supabase, user } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("orders").select("*").eq("id", orderId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) throw new Error("Order not found");
  return { order: data, user };
}

const refresh = (vendorId: string, orderId: string) => {
  revalidatePath(`/dashboard/v/${vendorId}/orders`);
  revalidatePath(`/dashboard/v/${vendorId}/orders/${orderId}`);
};

export async function setOrderStatus(vendorId: string, orderId: string, status: OrderStatus) {
  const { user } = await ownOrder(vendorId, orderId);
  await orders.updateOrderStatus(adminClient(), orderId, status, user.id);
  refresh(vendorId, orderId);
}

export async function confirmTransfer(vendorId: string, orderId: string, paymentId: string | null) {
  const { order, user } = await ownOrder(vendorId, orderId);
  const db = adminClient();
  const { data: p } = paymentId ? await db.from("payments").select("reference").eq("id", paymentId).eq("order_id", orderId).single() : { data: null };
  await orders.markPaid(db, orderId, order.payment_method === "cod" ? "cod" : "transfer",
    p?.reference ?? `MANUAL${order.number}-${Date.now().toString(36)}`, order.total_kobo, user.id, { via: "dashboard" });
  refresh(vendorId, orderId);
}

export async function rejectTransfer(vendorId: string, orderId: string, paymentId: string) {
  const { order } = await ownOrder(vendorId, orderId);
  const db = adminClient();
  await db.from("payments").update({ status: "rejected" }).eq("id", paymentId).eq("order_id", orderId);
  await sendToOrderCustomer(db, order.conversation_id,
    `We haven't received the transfer for order #${order.number} yet. Please check and send the correct receipt, or reply here if you need help.`);
  refresh(vendorId, orderId);
}

export async function sendPaymentLink(vendorId: string, orderId: string, _state?: ActionState, _f?: FormData): Promise<ActionState> {
  const { order } = await ownOrder(vendorId, orderId);
  const db = adminClient();
  const r = await orders.createPaymentLink(db, orderId);
  if ("error" in r) return { error: r.error };
  await sendToOrderCustomer(db, order.conversation_id, `Here's your payment link for order #${order.number}: ${r.url}`);
  refresh(vendorId, orderId);
  return { ok: true, message: "Payment link sent" };
}

export async function assignRider(vendorId: string, orderId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { order } = await ownOrder(vendorId, orderId);
  const db = adminClient();
  await db.from("orders").update({
    rider_name: String(f.get("rider_name") ?? "").trim() || null,
    rider_phone: String(f.get("rider_phone") ?? "").trim() || null,
  }).eq("id", orderId);
  refresh(vendorId, orderId);
  return { ok: true, message: `Rider saved. Send them this link to update delivery: ${env.appUrl}/r/${order.rider_token}` };
}
