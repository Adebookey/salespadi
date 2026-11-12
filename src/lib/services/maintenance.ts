// Housekeeping: Instagram token refresh and clearing out old processing data.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshInstagramToken } from "../channels/instagram";
import { decrypt, encrypt } from "../crypto";
import { audit } from "./notify";

const DAY = 86400_000;

/** Instagram long-lived tokens last 60 days. Refreshing weekly keeps them alive for as long as the vendor stays connected. */
export async function refreshInstagramTokens(db: SupabaseClient) {
  const { data: channels } = await db.from("channels").select("id, vendor_id, access_token_enc, display_name")
    .eq("type", "instagram").in("status", ["active", "error"]).not("access_token_enc", "is", null)
    .lt("token_refreshed_at", new Date(Date.now() - 7 * DAY).toISOString());
  let refreshed = 0;
  for (const c of channels ?? []) {
    try {
      const token = await refreshInstagramToken(decrypt(c.access_token_enc));
      await db.from("channels").update({ access_token_enc: encrypt(token), token_refreshed_at: new Date().toISOString(), status: "active" }).eq("id", c.id);
      refreshed++;
    } catch (e) {
      // Shown in the dashboard as "needs reconnecting".
      await db.from("channels").update({ status: "error" }).eq("id", c.id);
      await audit(db, c.vendor_id, "instagram_token_refresh_failed", "channel", c.id, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return refreshed;
}

/** Raw webhook payloads and finished jobs hold customer data and are only needed briefly. */
export async function cleanup(db: SupabaseClient, now = Date.now()) {
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  await db.from("webhook_events").delete().lt("received_at", ago(30));
  await db.from("jobs").delete().eq("status", "done").lt("created_at", ago(14));
  await db.from("jobs").delete().eq("status", "failed").lt("created_at", ago(60));
}
