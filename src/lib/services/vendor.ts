import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "../crypto";
import type { Channel, Vendor, VendorSettings } from "../types";
import type { VendorProfile } from "../ai/store";
import { env } from "../env";

export async function getVendor(db: SupabaseClient, vendorId: string): Promise<Vendor> {
  const { data, error } = await db.from("vendors").select("*").eq("id", vendorId).single();
  if (error || !data) throw new Error(`Vendor ${vendorId} not found: ${error?.message}`);
  return data as Vendor;
}

export async function getSettings(db: SupabaseClient, vendorId: string): Promise<VendorSettings> {
  const { data, error } = await db.from("vendor_settings").select("*").eq("vendor_id", vendorId).single();
  if (error || !data) throw new Error(`Settings for ${vendorId} not found: ${error?.message}`);
  return data as VendorSettings;
}

export function toProfile(v: Vendor, s: VendorSettings): VendorProfile {
  return {
    name: v.name,
    city: v.city,
    tone: s.tone,
    pidgin_enabled: s.pidgin_enabled,
    sample_replies: s.sample_replies ?? [],
    greeting: s.greeting,
    policies: s.policies,
    faqs: s.faqs ?? [],
    handoff_rules: s.handoff_rules,
    business_hours: s.business_hours,
    pay_on_delivery: v.pay_on_delivery,
    bank: v.bank_account_number && v.bank_name
      ? { name: v.bank_name, account_name: v.bank_account_name ?? v.name, account_number: v.bank_account_number }
      : null,
    paystack_enabled: Boolean(v.paystack_secret_enc || env.paystackSecretKey),
  };
}

export function channelToken(c: Pick<Channel, "access_token_enc">): string {
  if (!c.access_token_enc) throw new Error("Channel has no access token. Reconnect it in the vendor setup.");
  return decrypt(c.access_token_enc);
}

/** The vendor's own Paystack secret, or the platform key as a fallback (e.g. while testing). */
export function paystackKey(v: Pick<Vendor, "paystack_secret_enc">): string | null {
  if (v.paystack_secret_enc) return decrypt(v.paystack_secret_enc);
  return env.paystackSecretKey || null;
}
