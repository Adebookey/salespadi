// Erasing a customer's personal data on request (NDPA, Meta data-deletion instructions).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "./notify";

export async function deleteCustomerData(db: SupabaseClient, vendorId: string, customerId: string, actorId: string | null) {
  const { data: paths, error } = await db.rpc("delete_customer_data", { p_vendor: vendorId, p_customer: customerId });
  if (error) throw new Error(error.message);
  const files = (paths ?? []) as string[];
  if (files.length) {
    const { error: storageError } = await db.storage.from("chat-media").remove(files);
    if (storageError) console.warn("[deleteCustomerData] storage", storageError.message);
  }
  // No personal details in the audit entry, only that it happened.
  await audit(db, vendorId, "customer_data_deleted", "customer", customerId, { files: files.length }, actorId);
  return files.length;
}
