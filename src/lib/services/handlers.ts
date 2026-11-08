// Job type -> handler. Everything slow or retryable runs here, never inside a webhook request.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import type { JobHandler } from "../jobs";
import { enqueue } from "../jobs";
import { parseWhatsAppWebhook } from "../channels/whatsapp";
import { parseInstagramWebhook } from "../channels/instagram";
import { processComment, processInboundMessage, processStatuses } from "./inbound";
import { aiReply } from "./ai-reply";
import { afterPaid, markPaid } from "./orders";
import { sendToOrderCustomer } from "./messaging";
import { syncOrderToSheet } from "./sheets";
import { sendDailySummary, sendWeeklyReport } from "./reports";
import { enquiryFollowup, feedbackRequest, importFromInstagram, restockNotifyOne, sendBroadcast, unpaidReminder } from "./growth";
import { verifyTransaction } from "../paystack";
import { getVendor, paystackKey } from "./vendor";

async function rawEvent(db: SupabaseClient, id: number) {
  const { data } = await db.from("webhook_events").select("payload").eq("id", id).single();
  if (!data) throw new Error(`webhook event ${id} not found`);
  return data.payload;
}

const s = (v: unknown) => String(v);

export function jobHandlers(): Record<string, JobHandler> {
  const db = adminClient();
  return {
    "inbound.whatsapp": async (p) => {
      const { messages, statuses } = parseWhatsAppWebhook(await rawEvent(db, Number(p.eventId)));
      for (const m of messages) await processInboundMessage(db, m);
      await processStatuses(db, statuses);
    },
    "inbound.instagram": async (p) => {
      const { messages, comments } = parseInstagramWebhook(await rawEvent(db, Number(p.eventId)));
      for (const m of messages) await processInboundMessage(db, m);
      for (const c of comments) await processComment(db, c);
    },
    "inbound.paystack": async (p) => {
      const event = await rawEvent(db, Number(p.eventId));
      if (event?.event !== "charge.success") return;
      const reference = s(event.data?.reference);
      const { data: payment } = await db.from("payments").select("order_id, amount_kobo, vendor_id").eq("reference", reference).maybeSingle();
      if (!payment) return;
      // Double-check with Paystack before trusting the amount.
      const key = paystackKey(await getVendor(db, payment.vendor_id));
      const verified = key ? await verifyTransaction(key, reference) : null;
      if (!verified || verified.status !== "success" || verified.amount < payment.amount_kobo) {
        throw new Error(`Paystack verification failed for ${reference}`);
      }
      await markPaid(db, payment.order_id, "paystack", reference, verified.amount, null, event.data);
    },
    "ai.reply": async (p) => aiReply(db, s(p.conversationId)),
    "order.paid": async (p) => afterPaid(db, s(p.orderId)),
    "order.notify": async (p) => {
      const { data: o } = await db.from("orders").select("conversation_id").eq("id", s(p.orderId)).single();
      await sendToOrderCustomer(db, o?.conversation_id ?? null, s(p.text));
    },
    "order.reminder": async (p) => unpaidReminder(db, s(p.orderId), Number(p.n)),
    "order.feedback": async (p) => feedbackRequest(db, s(p.orderId)),
    "sheet.sync": async (p) => syncOrderToSheet(db, s(p.orderId)),
    "followup.enquiry": async (p) => enquiryFollowup(db, s(p.conversationId), s(p.afterMessage)),
    "restock.notify_one": async (p) => restockNotifyOne(db, s(p.requestId), s(p.variantId)),
    "broadcast.send": async (p) => sendBroadcast(db, s(p.broadcastId)),
    "vendor.daily_summary": async (p) => sendDailySummary(db, s(p.vendorId)),
    "vendor.weekly_report": async (p) => sendWeeklyReport(db, s(p.vendorId)),
    "instagram.import": async (p) => { await importFromInstagram(db, s(p.vendorId)); },
    "cron.daily": async () => {
      const { data } = await db.from("vendors").select("id").eq("status", "live");
      const day = new Date().toISOString().slice(0, 10);
      for (const v of data ?? []) await enqueue("vendor.daily_summary", { vendorId: v.id }, { dedupeKey: `once:daily:${v.id}:${day}` });
    },
    "cron.weekly": async () => {
      const { data } = await db.from("vendors").select("id").eq("status", "live");
      const day = new Date().toISOString().slice(0, 10);
      for (const v of data ?? []) await enqueue("vendor.weekly_report", { vendorId: v.id }, { dedupeKey: `once:weekly:${v.id}:${day}` });
    },
  };
}
