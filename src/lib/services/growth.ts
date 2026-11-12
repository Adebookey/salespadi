// Growth features: enquiry follow-ups, restock alerts, broadcasts, unpaid reminders, feedback, Instagram import.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "../env";
import { listInstagramMedia } from "../channels/instagram";
import { costMicros } from "../ai/models";
import { formatNaira } from "../money";
import type { Order } from "../types";
import { sendToConversation, sendToOrderCustomer, windowOpen } from "./messaging";
import { channelToken } from "./vendor";
import { audit } from "./notify";
import { enqueue } from "../jobs";

/** One gentle nudge ~20h after someone asked but didn't order (still inside the 24h window). */
export async function enquiryFollowup(db: SupabaseClient, conversationId: string, afterMessage: string) {
  const { data: conv } = await db.from("conversations").select("*").eq("id", conversationId).single();
  if (!conv || conv.status !== "ai" || !windowOpen(conv.last_inbound_at)) return;
  const { data: last } = await db.from("messages").select("external_id").eq("conversation_id", conversationId)
    .eq("direction", "in").order("created_at", { ascending: false }).limit(1).single();
  if (last?.external_id !== afterMessage) return; // they wrote again since; a newer job covers it
  if (conv.followup_sent_at && Date.now() - new Date(conv.followup_sent_at).getTime() < 7 * 86400_000) return;
  const { count } = await db.from("orders").select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId).gte("created_at", new Date(Date.now() - 2 * 86400_000).toISOString());
  if (count) return;
  await sendToConversation(db, conversationId, [{
    kind: "text",
    text: "Hi again 👋 Just checking in: did you find what you were looking for? I'm happy to help with sizes, photos or delivery whenever you're ready.",
  }], { sender: "ai", aiMeta: { followup: true } });
  await db.from("conversations").update({ followup_sent_at: new Date().toISOString() }).eq("id", conversationId);
}

/** When a variant comes back in stock, tell the customers who asked. */
export async function notifyRestock(db: SupabaseClient, vendorId: string, variantId: string) {
  const { data: v } = await db.from("product_variants").select("product_id, label, price_kobo, stock, product:products(name)")
    .eq("id", variantId).single();
  if (!v || v.stock <= 0) return;
  const { data: reqs } = await db.from("restock_requests").select("id, customer_id")
    .eq("vendor_id", vendorId).eq("product_id", v.product_id).is("notified_at", null)
    .or(`variant_id.is.null,variant_id.eq.${variantId}`);
  for (const r of reqs ?? []) {
    await enqueue("restock.notify_one", { requestId: r.id, variantId }, { dedupeKey: `once:restock:${r.id}` });
  }
}

export async function restockNotifyOne(db: SupabaseClient, requestId: string, variantId: string) {
  const { data: r } = await db.from("restock_requests").select("*").eq("id", requestId).single();
  if (!r || r.notified_at) return;
  const { data: v } = await db.from("product_variants").select("label, price_kobo, product:products(name)").eq("id", variantId).single();
  const { data: conv } = await db.from("conversations").select("id").eq("customer_id", r.customer_id)
    .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  const product = v as unknown as { label: string; price_kobo: number; product: { name: string } } | null;
  if (conv && product) {
    await sendToConversation(db, conv.id, [{
      kind: "text",
      text: `Good news! ${product.product.name} (${product.label}) is back in stock at ${formatNaira(product.price_kobo)}. Reply here if you'd like me to reserve one for you.`,
    }], { sender: "system", templateFallback: true }).catch((e) => console.warn("[restock]", e.message));
  }
  await db.from("restock_requests").update({ notified_at: new Date().toISOString() }).eq("id", requestId);
}

/** Payment reminders for unpaid orders (scheduled when the payment link or transfer option is chosen). */
export async function unpaidReminder(db: SupabaseClient, orderId: string, n: number) {
  const { data: o } = await db.from("orders").select("*").eq("id", orderId).single<Order>();
  if (!o || o.status !== "awaiting_payment") return;
  const { data: link } = await db.from("payments").select("authorization_url").eq("order_id", orderId)
    .eq("status", "pending").not("authorization_url", "is", null).limit(1).maybeSingle();
  const text = n === 1
    ? `Hi! Just a reminder that order #${o.number} (${formatNaira(o.total_kobo)}) is waiting for payment.${link?.authorization_url ? ` You can pay here: ${link.authorization_url}` : " Send the transfer receipt here once you've paid."}`
    : `Hello again. We're still holding order #${o.number} for you. If you still want it, please complete payment today${link?.authorization_url ? `: ${link.authorization_url}` : "."} If you've changed your mind, just let us know. 🙏`;
  if (await sendToOrderCustomer(db, o.conversation_id, text)) {
    await db.from("orders").update({ reminder_count: n, last_reminder_at: new Date().toISOString() }).eq("id", orderId);
  }
}

export async function feedbackRequest(db: SupabaseClient, orderId: string) {
  const { data: o } = await db.from("orders").select("number, conversation_id, status").eq("id", orderId).single();
  if (!o || o.status !== "delivered") return;
  await sendToOrderCustomer(db, o.conversation_id,
    `How did you find your order #${o.number}? We'd love a quick rating from 1 to 5, and any comment. It really helps our small business. 🙏`);
}

/**
 * Opt-in broadcasts. Inside the 24h window we send text; outside it we need the broadcast's approved template.
 * Each recipient is recorded before sending, so a retried or continued job never messages anyone twice.
 */
export async function sendBroadcast(db: SupabaseClient, broadcastId: string) {
  const { data: b } = await db.from("broadcasts").select("*").eq("id", broadcastId).single();
  if (!b || b.status === "sent") return;
  await db.from("broadcasts").update({ status: "sending" }).eq("id", broadcastId);
  const { data: convs } = await db.from("conversations")
    .select("id, last_inbound_at, channel_type, customer:customers!inner(opted_in_broadcast)")
    .eq("vendor_id", b.vendor_id).eq("customer.opted_in_broadcast", true);
  const { data: done } = await db.from("broadcast_recipients").select("conversation_id").eq("broadcast_id", broadcastId);
  const already = new Set((done ?? []).map((r) => r.conversation_id));
  const deadline = Date.now() + 200_000;

  for (const c of convs ?? []) {
    if (already.has(c.id)) continue;
    if (Date.now() > deadline) {
      // Big list: carry on in a fresh job rather than run out of time mid-send.
      await enqueue("broadcast.send", { broadcastId });
      return;
    }
    const open = windowOpen(c.last_inbound_at);
    const msg = open
      ? ({ kind: "text", text: b.message } as const)
      : c.channel_type === "whatsapp" && b.template_name
        ? ({ kind: "template", name: b.template_name, params: [b.message] } as const)
        : null;
    if (!msg) continue;
    const { error } = await db.from("broadcast_recipients").insert({ broadcast_id: broadcastId, conversation_id: c.id });
    if (error) continue; // another run got to this customer first
    try {
      await sendToConversation(db, c.id, [msg], { sender: "system", aiMeta: { broadcast: broadcastId } });
    } catch (e) {
      console.warn("[broadcast]", e instanceof Error ? e.message : e);
    }
  }
  const { count } = await db.from("broadcast_recipients").select("conversation_id", { count: "exact", head: true }).eq("broadcast_id", broadcastId);
  await db.from("broadcasts").update({ status: "sent", sent_count: count ?? 0 }).eq("id", broadcastId);
}

const Extracted = z.object({
  products: z.array(z.object({
    post_id: z.string(),
    is_product: z.boolean(),
    name: z.string(),
    description: z.string(),
    price_naira: z.number().nullable(),
    sizes: z.array(z.string()),
    category: z.string(),
  })),
});

/** Reads recent Instagram posts and creates draft (inactive) products from captions for the vendor to review. */
export async function importFromInstagram(db: SupabaseClient, vendorId: string) {
  const { data: channel } = await db.from("channels").select("*").eq("vendor_id", vendorId).eq("type", "instagram").neq("status", "disabled").maybeSingle();
  if (!channel) throw new Error("Connect Instagram first");
  const media = (await listInstagramMedia(channelToken(channel), 30)).filter((m) => m.caption);
  const { data: existing } = await db.from("products").select("source_post_id").eq("vendor_id", vendorId).not("source_post_id", "is", null);
  const seen = new Set((existing ?? []).map((p) => p.source_post_id));
  const fresh = media.filter((m) => !seen.has(m.id));
  if (!fresh.length) return 0;

  const client = new Anthropic();
  const res = await client.messages.create({
    model: env.aiModelRoutine,
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object", additionalProperties: false, required: ["products"],
          properties: {
            products: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                required: ["post_id", "is_product", "name", "description", "price_naira", "sizes", "category"],
                properties: {
                  post_id: { type: "string" }, is_product: { type: "boolean" }, name: { type: "string" },
                  description: { type: "string" }, price_naira: { type: ["number", "null"] },
                  sizes: { type: "array", items: { type: "string" } }, category: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    messages: [{
      role: "user",
      content: `These are Instagram captions from a Nigerian online shop. For each post, decide if it's selling a product. If so, give a short product name, a one-sentence description, the price in naira only if the caption states it (null otherwise; "18k" = 18000), any sizes listed, and a category.\n\n${JSON.stringify(fresh.map((m) => ({ post_id: m.id, caption: m.caption })))}`,
    }],
  });
  await db.from("ai_usage").insert({ vendor_id: vendorId, model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, cost_usd_micros: costMicros(res.model, res.usage) });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = Extracted.parse(JSON.parse(text));

  let created = 0;
  for (const p of parsed.products.filter((x) => x.is_product)) {
    const post = fresh.find((m) => m.id === p.post_id);
    if (!post) continue;
    const { data: product } = await db.from("products").insert({
      vendor_id: vendorId, name: p.name, description: p.description, category: p.category,
      is_active: false, source_post_id: post.id,
    }).select("id").single();
    if (!product) continue;
    const sizes = p.sizes.length ? p.sizes : [null];
    await db.from("product_variants").insert(sizes.map((s) => ({
      vendor_id: vendorId, product_id: product.id, label: s ? `Size ${s}` : "Standard", size: s,
      price_kobo: Math.round((p.price_naira ?? 0) * 100), stock: 0,
    })));
    const img = post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;
    if (img) await db.from("product_images").insert({ vendor_id: vendorId, product_id: product.id, url: img });
    created++;
  }
  await audit(db, vendorId, "instagram_import", undefined, undefined, { created });
  return created;
}
