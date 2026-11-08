// Alerts to the vendor (and you) on WhatsApp from the platform's own number.
// Business-initiated WhatsApp messages need an approved template; PLATFORM_WA_ALERT_TEMPLATE should have
// one body variable ({{1}}) that carries the alert text.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsApp } from "../channels/whatsapp";
import { env } from "../env";

export async function audit(
  db: SupabaseClient, vendorId: string | null, action: string,
  entity?: string, entityId?: string, data?: unknown, actorId?: string | null,
) {
  await db.from("audit_log").insert({ vendor_id: vendorId, action, entity, entity_id: entityId, data, actor_id: actorId ?? null });
}

/** Sends free text when the vendor messaged the platform number in the last 24h, otherwise the alert template. */
export async function alertVendor(db: SupabaseClient, vendorId: string, text: string) {
  const { data: v } = await db.from("vendors").select("owner_whatsapp, name").eq("id", vendorId).single();
  await audit(db, vendorId, "vendor_alert", undefined, undefined, { text });
  if (!v?.owner_whatsapp || !env.platformWaPhoneNumberId || !env.platformWaAccessToken) return false;
  const to = v.owner_whatsapp.replace(/\D/g, "");
  try {
    const { data: recent } = await db
      .from("audit_log")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("action", "vendor_command")
      .gte("created_at", new Date(Date.now() - 23.5 * 3600_000).toISOString())
      .limit(1);
    const msg = recent?.length
      ? ({ kind: "text", text } as const)
      : ({ kind: "template", name: env.platformWaAlertTemplate, params: [text.slice(0, 1000)] } as const);
    await sendWhatsApp(env.platformWaPhoneNumberId, env.platformWaAccessToken, to, msg);
    return true;
  } catch (e) {
    console.error("[alertVendor]", e);
    return false;
  }
}
