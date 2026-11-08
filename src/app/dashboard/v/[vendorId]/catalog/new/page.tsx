import { getVendorForUser } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createProduct } from "../../../../_actions/catalog";

export default async function NewProduct({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  await getVendorForUser(vendorId);
  return (
    <>
      <PageHeader title="Add product" description="You can add photos and fine-tune each option on the next screen." />
      <Card className="max-w-2xl">
        <form action={createProduct.bind(null, vendorId)} className="space-y-4">
          <Field label="Name"><Input name="name" required placeholder="Classic White Sneakers" /></Field>
          <Field label="Description"><Textarea name="description" rows={3} placeholder="Material, fit, what it goes with…" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category"><Input name="category" placeholder="Sneakers" /></Field>
            <Field label="Search words" hint="Comma separated: colours, styles, occasions."><Input name="tags" placeholder="white, leather, unisex" /></Field>
            <Field label="Price (₦)"><Input name="price" required placeholder="28000" /></Field>
            <Field label="Stock per option"><Input name="stock" type="number" min={0} defaultValue={1} /></Field>
          </div>
          <Field label="Sizes or options" hint="Comma separated, e.g. 40, 41, 42 or Small, Medium. Leave blank for a single option.">
            <Input name="sizes" placeholder="40, 41, 42, 43" />
          </Field>
          <SubmitButton>Create product</SubmitButton>
        </form>
      </Card>
    </>
  );
}
