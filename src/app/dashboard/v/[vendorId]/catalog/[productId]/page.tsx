import { notFound } from "next/navigation";
import { getVendorForUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui";
import type { Product, ProductImage, Variant } from "@/lib/types";
import { deleteProduct, removeProductImage, saveVariants, updateProduct } from "../../../../_actions/catalog";
import { ImageUpload } from "./image-upload";

export default async function ProductPage({ params }: { params: Promise<{ vendorId: string; productId: string }> }) {
  const { vendorId, productId } = await params;
  const { supabase } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("products").select("*, variants:product_variants(*), images:product_images(*)")
    .eq("id", productId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) notFound();
  const p = data as Product & { variants: Variant[]; images: ProductImage[] };
  const variants = [...p.variants].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const images = [...p.images].sort((a, b) => a.position - b.position);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <ActionForm action={updateProduct.bind(null, vendorId, productId)}>
          <h2 className="font-medium">Product</h2>
          <Field label="Name"><Input name="name" defaultValue={p.name} required /></Field>
          <Field label="Description"><Textarea name="description" defaultValue={p.description} rows={4} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category"><Input name="category" defaultValue={p.category ?? ""} /></Field>
            <Field label="Search words"><Input name="tags" defaultValue={p.tags.join(", ")} /></Field>
          </div>
          <Checkbox name="is_active" label="Visible to the AI (on sale)" defaultChecked={p.is_active} />
          <SubmitButton>Save product</SubmitButton>
        </ActionForm>
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h2 className="mb-3 font-medium">Photos</h2>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-full object-cover" />
                <form action={removeProductImage.bind(null, vendorId, img.id)} className="absolute right-1 top-1">
                  <button className="rounded bg-white/90 px-1.5 text-xs text-red-600 shadow">Remove</button>
                </form>
              </div>
            ))}
          </div>
          <ImageUpload vendorId={vendorId} productId={productId} />
        </div>
      </Card>
      <Card>
        <ActionForm action={saveVariants.bind(null, vendorId, productId)}>
          <h2 className="font-medium">Options, prices and stock</h2>
          <div className="space-y-3">
            {variants.map((v) => (
              <div key={v.id} className="grid grid-cols-[1fr_6rem_4.5rem] items-end gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-[1fr_5rem_5rem_6rem_4.5rem_auto]">
                <input type="hidden" name="variant_id" value={v.id} />
                <Field label="Option"><Input name={`label_${v.id}`} defaultValue={v.label} /></Field>
                <div className="hidden sm:block"><Field label="Size"><Input name={`size_${v.id}`} defaultValue={v.size ?? ""} /></Field></div>
                <div className="hidden sm:block"><Field label="Colour"><Input name={`colour_${v.id}`} defaultValue={v.colour ?? ""} /></Field></div>
                <Field label="Price ₦"><Input name={`price_${v.id}`} defaultValue={String(v.price_kobo / 100)} inputMode="decimal" /></Field>
                <Field label="Stock"><Input name={`stock_${v.id}`} type="number" min={0} defaultValue={v.stock} /></Field>
                <label className="col-span-3 flex items-center gap-1 pb-2 text-xs text-gray-500 sm:col-span-1"><input type="checkbox" name={`delete_${v.id}`} /> Delete</label>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 p-3">
            <div className="mb-2 text-sm font-medium">Add an option</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Input name="new_label" placeholder="Size 44" />
              <Input name="new_size" placeholder="Size" />
              <Input name="new_colour" placeholder="Colour" />
              <Input name="new_price" placeholder="Price ₦" />
              <Input name="new_stock" type="number" min={0} placeholder="Stock" />
            </div>
          </div>
          <SubmitButton>Save options</SubmitButton>
        </ActionForm>
        <form action={deleteProduct.bind(null, vendorId, productId)} className="mt-6 border-t border-gray-100 pt-4">
          <Button variant="ghost" className="px-0 text-red-600">Delete this product</Button>
        </form>
      </Card>
    </div>
  );
}
