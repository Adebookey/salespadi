import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Vendor } from "./types";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  return { supabase, user: data.user, isOperator: Boolean(profile?.is_operator), profile };
});

/** Loads a vendor the signed-in user can access (RLS decides), or 404s. */
export const getVendorForUser = cache(async (vendorId: string) => {
  const session = await getSession();
  const { data } = await session.supabase.from("vendors").select("*").eq("id", vendorId).maybeSingle();
  if (!data) notFound();
  return { ...session, vendor: data as Vendor };
});

export async function requireOperator() {
  const session = await getSession();
  if (!session.isOperator) redirect("/dashboard");
  return session;
}
