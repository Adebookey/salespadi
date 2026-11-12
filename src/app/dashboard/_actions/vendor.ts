"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { getVendorForUser, requireOperator } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { parseNairaToKobo } from "@/lib/money";
import { env } from "@/lib/env";
import { audit } from "@/lib/services/notify";
import { enqueue } from "@/lib/jobs";
import { parseFaqs } from "@/lib/faqs";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const phone = (s: string) => s.replace(/\D/g, "").replace(/^0(\d{10})$/, "234$1");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

export async function createVendor(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");
  const { data, error } = await supabase.from("vendors").insert({
    name,
    slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
    city: str(formData, "city") || "Lagos",
    instagram_handle: str(formData, "instagram_handle").replace(/^@/, "") || null,
    owner_whatsapp: phone(str(formData, "owner_whatsapp")) || null,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create vendor");
  await supabase.from("vendor_members").insert({ vendor_id: data.id, user_id: user.id, role: "operator" });
  redirect(`/dashboard/v/${data.id}/setup`);
}

const OWNER_ONLY = "Only the shop owner can change this. Ask the owner or your SalesPadi manager.";

/** Updates the vendor row as the signed-in user. Staff are blocked by the database, which reports no error, so we check a row actually changed. */
async function updateVendor(
  supabase: Awaited<ReturnType<typeof getVendorForUser>>["supabase"], vendorId: string, patch: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase.from("vendors").update(patch).eq("id", vendorId).select("id");
  if (error) return error.message;
  return data?.length ? null : OWNER_ONLY;
}

async function isOwner(supabase: Awaited<ReturnType<typeof getVendorForUser>>["supabase"], vendorId: string) {
  const { data } = await supabase.rpc("is_vendor_owner", { v: vendorId });
  return Boolean(data);
}

function done(vendorId: string, path = "") {
  revalidatePath(`/dashboard/v/${vendorId}${path}`, "layout");
  return { ok: true, message: "Saved" } as ActionState;
}

export async function saveBusiness(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const error = await updateVendor(supabase, vendorId, {
    name: str(f, "name"),
    city: str(f, "city") || null,
    instagram_handle: str(f, "instagram_handle").replace(/^@/, "") || null,
    business_phone: phone(str(f, "business_phone")) || null,
    owner_whatsapp: phone(str(f, "owner_whatsapp")) || null,
  });
  return error ? { error } : done(vendorId);
}

export async function saveVoice(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const { error } = await supabase.from("vendor_settings").update({
    tone: str(f, "tone"),
    pidgin_enabled: f.get("pidgin_enabled") === "on",
    greeting: str(f, "greeting") || null,
    sample_replies: str(f, "sample_replies").split("\n").map((s) => s.trim()).filter(Boolean),
  }).eq("vendor_id", vendorId);
  return error ? { error: error.message } : done(vendorId);
}

export async function savePolicies(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const days = f.getAll("days").map(Number).filter((n) => n >= 0 && n <= 6);
  const { error } = await supabase.from("vendor_settings").update({
    policies: str(f, "policies"),
    faqs: parseFaqs(str(f, "faqs")),
    handoff_rules: str(f, "handoff_rules"),
    business_hours: { open: str(f, "open") || "08:00", close: str(f, "close") || "20:00", days },
  }).eq("vendor_id", vendorId);
  return error ? { error: error.message } : done(vendorId);
}

export async function addZone(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const fee = parseNairaToKobo(str(f, "fee"));
  if (fee === null) return { error: "Enter the fee in naira, e.g. 3500" };
  const { error } = await supabase.from("delivery_zones").insert({
    vendor_id: vendorId, name: str(f, "name"), fee_kobo: fee, eta: str(f, "eta") || null,
    areas: str(f, "areas").split(",").map((s) => s.trim()).filter(Boolean),
  });
  return error ? { error: error.message } : done(vendorId);
}

export async function deleteZone(vendorId: string, zoneId: string) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("delivery_zones").delete().eq("id", zoneId).eq("vendor_id", vendorId);
  done(vendorId);
}

export async function savePayments(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const patch: Record<string, unknown> = {
    bank_name: str(f, "bank_name") || null,
    bank_account_name: str(f, "bank_account_name") || null,
    bank_account_number: str(f, "bank_account_number").replace(/\D/g, "") || null,
    pay_on_delivery: f.get("pay_on_delivery") === "on",
    google_sheet_id: str(f, "google_sheet_id").match(/[-\w]{25,}/)?.[0] ?? null,
    low_stock_threshold: Number(str(f, "low_stock_threshold") || 3),
  };
  const key = str(f, "paystack_secret");
  if (key) {
    if (!/^sk_(test|live)_/.test(key)) return { error: "That doesn't look like a Paystack secret key (sk_live_… or sk_test_…)." };
    patch.paystack_secret_enc = encrypt(key);
  }
  const error = await updateVendor(supabase, vendorId, patch);
  if (!error && key) await audit(adminClient(), vendorId, "paystack_key_set");
  return error ? { error } : done(vendorId);
}

export async function connectWhatsApp(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  if (!(await isOwner(supabase, vendorId))) return { error: OWNER_ONLY };
  const phoneNumberId = str(f, "phone_number_id");
  const wabaId = str(f, "waba_id");
  const token = str(f, "access_token");
  if (!phoneNumberId || !wabaId || !token) return { error: "Phone number ID, WhatsApp Business Account ID and access token are all required." };
  const res = await fetch(`https://graph.facebook.com/${env.metaGraphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Meta rejected these details: ${info?.error?.message ?? res.status}` };
  // Meta only delivers a number's messages to apps its WhatsApp Business Account is subscribed to.
  const sub = await fetch(`https://graph.facebook.com/${env.metaGraphVersion}/${wabaId}/subscribed_apps`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  });
  if (!sub.ok) {
    const body = await sub.json().catch(() => ({}));
    return { error: `Couldn't subscribe this WhatsApp Business Account to the app, so no messages would arrive: ${body?.error?.message ?? sub.status}. Check the account ID and that the token has whatsapp_business_management permission.` };
  }
  const { error } = await adminClient().from("channels").upsert({
    vendor_id: vendorId, type: "whatsapp", external_id: phoneNumberId, waba_id: wabaId,
    display_name: info.display_phone_number ?? null, access_token_enc: encrypt(token), status: "active",
    token_refreshed_at: new Date().toISOString(),
  }, { onConflict: "type,external_id" });
  if (error) return { error: error.message };
  await audit(adminClient(), vendorId, "channel_connected", "whatsapp", phoneNumberId);
  done(vendorId);
  return { ok: true, message: `Connected ${info.display_phone_number ?? phoneNumberId} (${info.verified_name ?? "WhatsApp"})` };
}

export async function connectInstagram(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  if (!(await isOwner(supabase, vendorId))) return { error: OWNER_ONLY };
  const token = str(f, "access_token");
  if (!token) return { error: "Access token is required." };
  const res = await fetch(`https://graph.instagram.com/${env.metaGraphVersion}/me?fields=user_id,username`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await res.json().catch(() => ({}));
  if (!res.ok || !info.user_id) return { error: `Instagram rejected this token: ${info?.error?.message ?? res.status}` };
  const db = adminClient();
  const { error } = await db.from("channels").upsert({
    vendor_id: vendorId, type: "instagram", external_id: String(info.user_id),
    display_name: `@${info.username}`, access_token_enc: encrypt(token), status: "active",
    token_refreshed_at: new Date().toISOString(),
  }, { onConflict: "type,external_id" });
  if (error) return { error: error.message };
  // Subscribe the account to message and comment webhooks.
  const sub = await fetch(`https://graph.instagram.com/${env.metaGraphVersion}/me/subscribed_apps?subscribed_fields=messages,comments`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  const subscribed = Boolean(sub?.ok);
  await db.from("vendors").update({ instagram_handle: info.username }).eq("id", vendorId);
  await audit(db, vendorId, "channel_connected", "instagram", String(info.user_id));
  done(vendorId);
  return subscribed
    ? { ok: true, message: `Connected @${info.username}` }
    : { error: `Saved @${info.username}, but Instagram refused the message subscription, so DMs won't arrive yet. Check the token has instagram_business_manage_messages, then connect again.` };
}

export async function disconnectChannel(vendorId: string, channelId: string) {
  const { supabase } = await getVendorForUser(vendorId);
  if (!(await isOwner(supabase, vendorId))) return;
  await supabase.from("channels").update({ status: "disabled", access_token_enc: null }).eq("id", channelId).eq("vendor_id", vendorId);
  done(vendorId);
}

export async function setVendorStatus(vendorId: string, status: "onboarding" | "live" | "paused") {
  const { supabase } = await getVendorForUser(vendorId);
  if (await updateVendor(supabase, vendorId, { status })) return;
  await audit(adminClient(), vendorId, "vendor_status", "vendor", vendorId, { status });
  done(vendorId);
}

export async function toggleAI(vendorId: string, enabled: boolean) {
  const { supabase } = await getVendorForUser(vendorId);
  await updateVendor(supabase, vendorId, { ai_enabled: enabled });
  done(vendorId);
}

export async function saveBilling(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireOperator();
  const { supabase } = await getVendorForUser(vendorId);
  const budget = Number(str(f, "ai_daily_budget_usd") || 2);
  if (!Number.isFinite(budget) || budget < 0) return { error: "Enter the AI budget in dollars per day, e.g. 2" };
  const error = await updateVendor(supabase, vendorId, {
    setup_fee_kobo: parseNairaToKobo(str(f, "setup_fee") || "0") ?? 0,
    monthly_fee_kobo: parseNairaToKobo(str(f, "monthly_fee") || "0") ?? 0,
    next_billing_date: str(f, "next_billing_date") || null,
    ai_daily_budget_usd: budget,
  });
  revalidatePath("/dashboard/billing");
  return error ? { error } : done(vendorId);
}

export async function recordSubscriptionPayment(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await requireOperator();
  const amount = parseNairaToKobo(str(f, "amount"));
  if (!amount) return { error: "Enter an amount" };
  const { error } = await supabase.from("subscription_payments").insert({
    vendor_id: vendorId, amount_kobo: amount, paid_on: str(f, "paid_on") || undefined, note: str(f, "note") || null,
  });
  if (error) return { error: error.message };
  // Move the next billing date on by a month.
  const { data: v } = await supabase.from("vendors").select("next_billing_date").eq("id", vendorId).single();
  if (v?.next_billing_date) {
    const d = new Date(v.next_billing_date);
    d.setMonth(d.getMonth() + 1);
    await supabase.from("vendors").update({ next_billing_date: d.toISOString().slice(0, 10) }).eq("id", vendorId);
  }
  revalidatePath("/dashboard/billing");
  return { ok: true, message: "Payment recorded" };
}

/**
 * Adds a person to the shop. New people get an account with a one-time password that the inviter passes on
 * (WhatsApp is fine); they change it under Account after signing in. No email has to arrive for this to work.
 */
export async function inviteMember(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  if (!(await isOwner(supabase, vendorId))) return { error: "Only the shop owner can add people." };
  const email = str(f, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  const role = str(f, "role") === "owner" ? "owner" : "staff";
  const db = adminClient();

  const tempPassword = randomBytes(9).toString("base64url");
  const created = await db.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true, user_metadata: { full_name: str(f, "full_name") },
  });
  let userId = created.data.user?.id;
  const isNew = Boolean(userId);
  if (!userId) {
    // Already has an account: look them up (pages of 200 until found).
    for (let page = 1; page <= 25 && !userId; page++) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (!list?.users.length) break;
    }
  }
  if (!userId) return { error: created.error?.message ?? "Could not add that email" };

  const { error } = await db.from("vendor_members").upsert({ vendor_id: vendorId, user_id: userId, role });
  if (error) return { error: error.message };
  await audit(db, vendorId, "member_added", "user", userId, { role });
  done(vendorId, "/team");
  return {
    ok: true,
    message: isNew
      ? `${email} added. Send them this one-time password: ${tempPassword}  They sign in at ${env.appUrl}/login and should change it under Account. It won't be shown again.`
      : `${email} already has a SalesPadi account and can now open this shop with their existing password.`,
  };
}

export async function removeMember(vendorId: string, userId: string) {
  const { supabase, user } = await getVendorForUser(vendorId);
  if (userId === user.id || !(await isOwner(supabase, vendorId))) return;
  await supabase.from("vendor_members").delete().eq("vendor_id", vendorId).eq("user_id", userId);
  done(vendorId, "/team");
}

export async function importInstagram(vendorId: string) {
  await getVendorForUser(vendorId);
  await enqueue("instagram.import", { vendorId }, { dedupeKey: `slot:igimport:${vendorId}` });
  done(vendorId, "/catalog");
}
