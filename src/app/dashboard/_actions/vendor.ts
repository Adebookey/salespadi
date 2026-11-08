"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, getVendorForUser, requireOperator } from "@/lib/auth";
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

function done(vendorId: string, path = "") {
  revalidatePath(`/dashboard/v/${vendorId}${path}`, "layout");
  return { ok: true, message: "Saved" } as ActionState;
}

export async function saveBusiness(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const { error } = await supabase.from("vendors").update({
    name: str(f, "name"),
    city: str(f, "city") || null,
    instagram_handle: str(f, "instagram_handle").replace(/^@/, "") || null,
    business_phone: phone(str(f, "business_phone")) || null,
    owner_whatsapp: phone(str(f, "owner_whatsapp")) || null,
  }).eq("id", vendorId);
  return error ? { error: error.message } : done(vendorId);
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
  const { error } = await supabase.from("vendors").update(patch).eq("id", vendorId);
  if (!error && key) await audit(adminClient(), vendorId, "paystack_key_set");
  return error ? { error: error.message } : done(vendorId);
}

export async function connectWhatsApp(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  await getVendorForUser(vendorId);
  const phoneNumberId = str(f, "phone_number_id");
  const token = str(f, "access_token");
  if (!phoneNumberId || !token) return { error: "Phone number ID and access token are required." };
  const res = await fetch(`https://graph.facebook.com/${env.metaGraphVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Meta rejected these details: ${info?.error?.message ?? res.status}` };
  const { error } = await adminClient().from("channels").upsert({
    vendor_id: vendorId, type: "whatsapp", external_id: phoneNumberId, waba_id: str(f, "waba_id") || null,
    display_name: info.display_phone_number ?? null, access_token_enc: encrypt(token), status: "active",
  }, { onConflict: "type,external_id" });
  if (error) return { error: error.message };
  await audit(adminClient(), vendorId, "channel_connected", "whatsapp", phoneNumberId);
  done(vendorId);
  return { ok: true, message: `Connected ${info.display_phone_number ?? phoneNumberId} (${info.verified_name ?? "WhatsApp"})` };
}

export async function connectInstagram(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  await getVendorForUser(vendorId);
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
  }, { onConflict: "type,external_id" });
  if (error) return { error: error.message };
  // Subscribe the account to message and comment webhooks.
  await fetch(`https://graph.instagram.com/${env.metaGraphVersion}/me/subscribed_apps?subscribed_fields=messages,comments`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  await db.from("vendors").update({ instagram_handle: info.username }).eq("id", vendorId);
  await audit(db, vendorId, "channel_connected", "instagram", String(info.user_id));
  done(vendorId);
  return { ok: true, message: `Connected @${info.username}` };
}

export async function disconnectChannel(vendorId: string, channelId: string) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("channels").update({ status: "disabled", access_token_enc: null }).eq("id", channelId).eq("vendor_id", vendorId);
  done(vendorId);
}

export async function setVendorStatus(vendorId: string, status: "onboarding" | "live" | "paused") {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("vendors").update({ status }).eq("id", vendorId);
  await audit(adminClient(), vendorId, "vendor_status", "vendor", vendorId, { status });
  done(vendorId);
}

export async function toggleAI(vendorId: string, enabled: boolean) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("vendors").update({ ai_enabled: enabled }).eq("id", vendorId);
  done(vendorId);
}

export async function saveBilling(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  await requireOperator();
  const { supabase } = await getVendorForUser(vendorId);
  const { error } = await supabase.from("vendors").update({
    setup_fee_kobo: parseNairaToKobo(str(f, "setup_fee") || "0") ?? 0,
    monthly_fee_kobo: parseNairaToKobo(str(f, "monthly_fee") || "0") ?? 0,
    next_billing_date: str(f, "next_billing_date") || null,
  }).eq("id", vendorId);
  revalidatePath("/dashboard/billing");
  return error ? { error: error.message } : done(vendorId);
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

export async function inviteMember(vendorId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const { data: canManage } = await supabase.rpc("is_vendor_owner", { v: vendorId });
  if (!canManage) return { error: "Only the shop owner can add people." };
  const email = str(f, "email").toLowerCase();
  const role = str(f, "role") === "owner" ? "owner" : "staff";
  const db = adminClient();
  let userId: string | undefined;
  const invite = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.appUrl}/auth/callback?next=/dashboard/v/${vendorId}`,
    data: { full_name: str(f, "full_name") },
  });
  if (invite.data.user) userId = invite.data.user.id;
  else {
    // Already registered: find them.
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id;
  }
  if (!userId) return { error: invite.error?.message ?? "Could not invite that email" };
  const { error } = await db.from("vendor_members").upsert({ vendor_id: vendorId, user_id: userId, role });
  if (error) return { error: error.message };
  done(vendorId, "/team");
  return { ok: true, message: `${email} can now sign in to this shop.` };
}

export async function removeMember(vendorId: string, userId: string) {
  const { supabase, user } = await getSession();
  if (userId === user.id) return;
  await supabase.from("vendor_members").delete().eq("vendor_id", vendorId).eq("user_id", userId);
  done(vendorId, "/team");
}

export async function importInstagram(vendorId: string) {
  await getVendorForUser(vendorId);
  await enqueue("instagram.import", { vendorId }, { dedupeKey: `slot:igimport:${vendorId}` });
  done(vendorId, "/catalog");
}
