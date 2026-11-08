import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { Badge, Button, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { importInstagram } from "../../../_actions/vendor";

interface Row {
  id: string; name: string; category: string | null; is_active: boolean; source_post_id: string | null;
  variants: { price_kobo: number; stock: number }[]; images: { url: string; position: number }[];
}

export default async function CatalogPage({ params, searchParams }: { params: Promise<{ vendorId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { vendorId } = await params;
  const { q } = await searchParams;
  const { supabase } = await getVendorForUser(vendorId);
  let query = supabase.from("products").select("id, name, category, is_active, source_post_id, variants:product_variants(price_kobo, stock), images:product_images(url, position)")
    .eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const { data: ig } = await supabase.from("channels").select("id").eq("vendor_id", vendorId).eq("type", "instagram").neq("status", "disabled").maybeSingle();
  const products = (data ?? []) as Row[];
  const drafts = products.filter((p) => !p.is_active && p.source_post_id).length;

  return (
    <>
      <PageHeader title="Catalog" description="The AI only sells what's here, at these prices."
        actions={<>
          {ig && <form action={importInstagram.bind(null, vendorId)}><Button variant="secondary">Import from Instagram</Button></form>}
          <LinkButton href={`/dashboard/v/${vendorId}/catalog/new`}>Add product</LinkButton>
        </>} />
      {drafts > 0 && <p className="mb-3 text-sm text-amber-700">{drafts} imported draft(s) need prices and stock before the AI can sell them.</p>}
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search products…" className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-gray-300 sm:max-w-xs" /></form>
      {products.length === 0 ? <Empty title="No products yet">Add the vendor&apos;s products with photos, sizes, prices and stock.</Empty> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const prices = p.variants.map((v) => v.price_kobo);
            const stock = p.variants.reduce((s, v) => s + v.stock, 0);
            const img = [...p.images].sort((a, b) => a.position - b.position)[0]?.url;
            return (
              <Link key={p.id} href={`/dashboard/v/${vendorId}/catalog/${p.id}`}>
                <Card className="h-full p-0 transition hover:ring-brand-500">
                  <div className="aspect-square overflow-hidden rounded-t-xl bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img ? <img src={img} alt={p.name} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-xs text-gray-400">No photo</div>}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="text-sm text-gray-600">{prices.length ? formatNaira(Math.min(...prices)) : "-"}</div>
                    <div className="flex flex-wrap gap-1">
                      {!p.is_active && <Badge colour="amber">{p.source_post_id ? "Draft" : "Hidden"}</Badge>}
                      <Badge colour={stock === 0 ? "red" : stock <= 3 ? "amber" : "gray"}>{stock === 0 ? "Sold out" : `${stock} in stock`}</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
