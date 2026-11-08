// Service-role client: bypasses RLS. Only for webhooks, the job worker and cron. Never import into client code.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  admin ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
