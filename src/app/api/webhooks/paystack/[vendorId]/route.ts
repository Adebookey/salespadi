// Each vendor's Paystack account points its webhook at /api/webhooks/paystack/<vendorId>,
// so we know which secret key signed the event.
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyPaystackSignature } from "@/lib/paystack";
import { paystackKey } from "@/lib/services/vendor";
import { acceptWebhook } from "@/lib/webhooks";

export async function POST(req: Request, ctx: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await ctx.params;
  const raw = await req.text();
  const { data: vendor } = await adminClient().from("vendors").select("paystack_secret_enc").eq("id", vendorId).maybeSingle();
  const key = vendor ? paystackKey(vendor) : null;
  if (!key || !verifyPaystackSignature(key, raw, req.headers.get("x-paystack-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  await acceptWebhook("paystack", raw, "inbound.paystack");
  return NextResponse.json({ ok: true });
}
