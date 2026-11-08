import { requireOperator } from "@/lib/auth";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createVendor } from "../../_actions/vendor";

export default async function NewVendor() {
  await requireOperator();
  return (
    <>
      <PageHeader title="Add vendor" description="You'll go through the setup wizard next." />
      <Card className="max-w-lg">
        <form action={createVendor} className="space-y-4">
          <Field label="Business name"><Input name="name" required placeholder="Kicks by Tolu" /></Field>
          <Field label="City"><Input name="city" defaultValue="Lagos" /></Field>
          <Field label="Instagram handle"><Input name="instagram_handle" placeholder="@kicksbytolu" /></Field>
          <Field label="Owner's WhatsApp number"><Input name="owner_whatsapp" placeholder="0801 234 5678" /></Field>
          <SubmitButton>Create and start setup</SubmitButton>
        </form>
      </Card>
    </>
  );
}
