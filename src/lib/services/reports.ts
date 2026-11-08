// Daily WhatsApp summary and weekly report for vendors.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatNaira } from "../money";
import type { Vendor } from "../types";
import { alertVendor } from "./notify";

export interface VendorStats {
  orders: number;
  paid_orders: number;
  revenue_kobo: number;
  conversations: number;
  needs_attention: number;
  awaiting_payment: number;
  ai_cost_usd_micros: number;
  top_products: { name: string; qty: number; revenue_kobo: number }[];
}

export async function vendorStats(db: SupabaseClient, vendorId: string, since: Date): Promise<VendorStats> {
  const { data, error } = await db.rpc("vendor_stats", { p_vendor: vendorId, p_since: since.toISOString() });
  if (error) throw new Error(error.message);
  return data as VendorStats;
}

/** Midnight today in Lagos (UTC+1, no daylight saving). */
export function lagosStartOfDay(now = new Date()) {
  const lagos = new Date(now.getTime() + 3600_000);
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 3600_000);
}

export async function dailySummaryText(db: SupabaseClient, vendor: Pick<Vendor, "id" | "name">) {
  const s = await vendorStats(db, vendor.id, lagosStartOfDay());
  const lines = [
    `📊 *${vendor.name} - today*`,
    `Chats: ${s.conversations}`,
    `New orders: ${s.orders}`,
    `Paid: ${s.paid_orders} (${formatNaira(s.revenue_kobo)})`,
    `Waiting for payment: ${s.awaiting_payment}`,
    s.needs_attention ? `⚠️ ${s.needs_attention} chat(s) need you - open SalesPadi.` : `No chats waiting for you. 👍`,
  ];
  if (s.top_products.length) lines.push(`Top today: ${s.top_products.map((p) => `${p.name} (${p.qty})`).join(", ")}`);
  return lines.join("\n");
}

export async function sendDailySummary(db: SupabaseClient, vendorId: string) {
  const { data: v } = await db.from("vendors").select("id, name").eq("id", vendorId).single();
  if (v) await alertVendor(db, vendorId, await dailySummaryText(db, v));
}

export async function weeklyReportText(db: SupabaseClient, vendor: Pick<Vendor, "id" | "name">) {
  const since = new Date(Date.now() - 7 * 86400_000);
  const s = await vendorStats(db, vendor.id, since);
  const conversion = s.conversations ? Math.round((s.paid_orders / s.conversations) * 100) : 0;
  return [
    `📈 *${vendor.name} - last 7 days*`,
    `Customer chats: ${s.conversations}`,
    `Orders: ${s.orders} · Paid: ${s.paid_orders}`,
    `Sales: ${formatNaira(s.revenue_kobo)}`,
    `Chat-to-sale conversion: ${conversion}%`,
    s.top_products.length ? `Top products: ${s.top_products.map((p) => `${p.name} (${p.qty})`).join(", ")}` : "No paid orders yet this week.",
  ].join("\n");
}

export async function sendWeeklyReport(db: SupabaseClient, vendorId: string) {
  const { data: v } = await db.from("vendors").select("id, name").eq("id", vendorId).single();
  if (v) await alertVendor(db, vendorId, await weeklyReportText(db, v));
}

export const daysAgo = (n: number, now = new Date()) => new Date(now.getTime() - n * 86400_000);
