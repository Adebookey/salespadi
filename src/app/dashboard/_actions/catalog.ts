"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { parseNairaToKobo } from "@/lib/money";
import { notifyRestock } from "@/lib/services/growth";
import type { ActionState } from "./vendor";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createProduct(vendorId: string, f: FormData) {
  const { supabase } = await getVendorForUser(vendorId);
  const price = parseNairaToKobo(str(f, "price")) ?? 0;
  const { data, error } = await supabase.from("products").insert({
    vendor_id: vendorId, name: str(f, "name"), description: str(f, "description"),
    category: str(f, "category") || null,
    tags: str(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create product");
  const sizes = str(f, "sizes").split(",").map((s) => s.trim()).filter(Boolean);
  const stock = Number(str(f, "stock") || 0);
  await supabase.from("product_variants").insert(
    (sizes.length ? sizes : [""]).map((s) => ({
      vendor_id: vendorId, product_id: data.id, label: s ? (/^\d/.test(s) ? `Size ${s}` : s) : "Standard",
      size: s || null, price_kobo: price, stock,
    })),
  );
  redirect(`/dashboard/v/${vendorId}/catalog/${data.id}`);
}

export async function updateProduct(vendorId: string, productId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const { error } = await supabase.from("products").update({
    name: str(f, "name"), description: str(f, "description"), category: str(f, "category") || null,
    tags: str(f, "tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    is_active: f.get("is_active") === "on",
  }).eq("id", productId).eq("vendor_id", vendorId);
  revalidatePath(`/dashboard/v/${vendorId}/catalog`, "layout");
  return error ? { error: error.message } : { ok: true, message: "Saved" };
}

export async function deleteProduct(vendorId: string, productId: string) {
  const { supabase } = await getVendorForUser(vendorId);
  await supabase.from("products").delete().eq("id", productId).eq("vendor_id", vendorId);
  redirect(`/dashboard/v/${vendorId}/catalog`);
}

/** Saves every option row of the product form in one go (label, price, stock), adds a new one if filled in. */
export async function saveVariants(vendorId: string, productId: string, _: ActionState, f: FormData): Promise<ActionState> {
  const { supabase } = await getVendorForUser(vendorId);
  const ids = f.getAll("variant_id").map(String);
  const restocked: string[] = [];
  const { data: before } = await supabase.from("product_variants").select("id, stock").eq("product_id", productId);
  for (const id of ids) {
    if (f.get(`delete_${id}`) === "on") {
      await supabase.from("product_variants").delete().eq("id", id).eq("vendor_id", vendorId);
      continue;
    }
    const price = parseNairaToKobo(str(f, `price_${id}`));
    const stock = Math.max(0, Number(str(f, `stock_${id}`) || 0));
    if (price === null) return { error: `Invalid price for ${str(f, `label_${id}`)}` };
    await supabase.from("product_variants").update({
      label: str(f, `label_${id}`), size: str(f, `size_${id}`) || null, colour: str(f, `colour_${id}`) || null,
      price_kobo: price, stock,
    }).eq("id", id).eq("vendor_id", vendorId);
    const old = before?.find((b) => b.id === id);
    if (old && old.stock === 0 && stock > 0) restocked.push(id);
  }
  const newLabel = str(f, "new_label");
  if (newLabel) {
    const price = parseNairaToKobo(str(f, "new_price"));
    if (price === null) return { error: "Enter a price for the new option" };
    await supabase.from("product_variants").insert({
      vendor_id: vendorId, product_id: productId, label: newLabel, size: str(f, "new_size") || null,
      colour: str(f, "new_colour") || null, price_kobo: price, stock: Math.max(0, Number(str(f, "new_stock") || 0)),
    });
  }
  for (const id of restocked) await notifyRestock(adminClient(), vendorId, id);
  revalidatePath(`/dashboard/v/${vendorId}/catalog`, "layout");
  return { ok: true, message: restocked.length ? `Saved. Told waiting customers about ${restocked.length} restocked option(s).` : "Saved" };
}

/** Called after the browser uploads a photo to the product-images bucket. */
export async function addProductImage(vendorId: string, productId: string, storagePath: string) {
  const { supabase } = await getVendorForUser(vendorId);
  if (!storagePath.startsWith(`${vendorId}/`)) throw new Error("Invalid path");
  const { data } = supabase.storage.from("product-images").getPublicUrl(storagePath);
  const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
  await supabase.from("product_images").insert({
    vendor_id: vendorId, product_id: productId, storage_path: storagePath, url: data.publicUrl, position: count ?? 0,
  });
  revalidatePath(`/dashboard/v/${vendorId}/catalog/${productId}`);
}

export async function removeProductImage(vendorId: string, imageId: string) {
  const { supabase } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("product_images").delete().eq("id", imageId).eq("vendor_id", vendorId).select("storage_path, product_id").single();
  if (data?.storage_path) await supabase.storage.from("product-images").remove([data.storage_path]);
  revalidatePath(`/dashboard/v/${vendorId}/catalog`, "layout");
}
