// The prompt studio runs the real agent against the vendor's live catalog, but in a sandbox:
// orders, handoffs and payment links are simulated in memory, nothing is sent to customers.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MemoryStore, type MemoryCatalogItem } from "../ai/memory-store";
import type { DeliveryZone } from "../types";
import { getSettings, getVendor, toProfile } from "./vendor";

export async function loadStudioStore(db: SupabaseClient, vendorId: string) {
  const [vendor, settings, products, zones] = await Promise.all([
    getVendor(db, vendorId),
    getSettings(db, vendorId),
    db.from("products").select("id, name, description, category, tags, variants:product_variants(id, label, size, colour, price_kobo, stock), images:product_images(url, position)")
      .eq("vendor_id", vendorId).eq("is_active", true),
    db.from("delivery_zones").select("*").eq("vendor_id", vendorId),
  ]);
  const catalog: MemoryCatalogItem[] = (products.data ?? []).map((p) => ({
    id: p.id, name: p.name, description: p.description, category: p.category ?? "", tags: p.tags ?? [],
    images: [...(p.images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url),
    variants: p.variants ?? [],
  }));
  return new MemoryStore(toProfile(vendor, settings), catalog, (zones.data ?? []) as DeliveryZone[]);
}
