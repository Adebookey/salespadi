// Mirrors orders into the vendor's Google Sheet. Share the sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL (editor).
// Each order is one row keyed by order number; status updates rewrite the same row.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { env } from "../env";
import { ORDER_STATUS_LABEL, type Order, type OrderItem } from "../types";

const HEADER = ["Order #", "Date", "Status", "Customer", "Phone", "Items", "Subtotal (₦)", "Delivery (₦)", "Total (₦)", "Payment", "Address", "Rider", "Updated"];
const TAB = "Orders";

function sheetsClient() {
  if (!env.googleServiceAccountEmail || !env.googleServiceAccountKey) return null;
  const auth = new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googleServiceAccountKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export function orderRow(o: Order & { items: OrderItem[] }) {
  const lagos = (d: string) => new Date(d).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
  return [
    String(o.number), lagos(o.created_at), ORDER_STATUS_LABEL[o.status], o.customer_name ?? "", o.customer_phone ?? "",
    o.items.map((i) => `${i.quantity} x ${i.name}${i.variant_label ? ` (${i.variant_label})` : ""}`).join("; "),
    o.subtotal_kobo / 100, o.delivery_fee_kobo / 100, o.total_kobo / 100, o.payment_method ?? "",
    o.delivery_address ?? "", o.rider_name ?? "", lagos(new Date().toISOString()),
  ];
}

export async function syncOrderToSheet(db: SupabaseClient, orderId: string) {
  const sheets = sheetsClient();
  if (!sheets) return;
  const { data } = await db.from("orders").select("*, items:order_items(*), vendor:vendors(google_sheet_id)").eq("id", orderId).single();
  const order = data as (Order & { items: OrderItem[]; vendor: { google_sheet_id: string | null } }) | null;
  const sheetId = order?.vendor.google_sheet_id;
  if (!order || !sheetId) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  if (!meta.data.sheets?.some((s) => s.properties?.title === TAB)) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] } });
    await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${TAB}!A1`, valueInputOption: "RAW", requestBody: { values: [HEADER] } });
  }
  const col = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${TAB}!A:A` });
  const rowIndex = (col.data.values ?? []).findIndex((r) => r[0] === String(order.number));
  const values = [orderRow(order)];
  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${TAB}!A${rowIndex + 1}`, valueInputOption: "USER_ENTERED", requestBody: { values } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: sheetId, range: `${TAB}!A1`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values } });
  }
  await db.from("orders").update({ sheet_synced_at: new Date().toISOString() }).eq("id", orderId);
}
