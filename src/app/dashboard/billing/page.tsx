import { requireOperator } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Input, PageHeader } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { recordSubscriptionPayment, saveBilling } from "../_actions/vendor";

export default async function BillingPage() {
  const { supabase } = await requireOperator();
  const [{ data: vendors }, { data: payments }] = await Promise.all([
    supabase.from("vendors").select("id, name, status, setup_fee_kobo, monthly_fee_kobo, next_billing_date").order("next_billing_date", { nullsFirst: false }),
    supabase.from("subscription_payments").select("vendor_id, amount_kobo, paid_on").order("paid_on", { ascending: false }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const mrr = (vendors ?? []).filter((v) => v.status === "live").reduce((s, v) => s + v.monthly_fee_kobo, 0);

  return (
    <>
      <PageHeader title="Billing" description={`Your clients' subscriptions. Monthly recurring from live vendors: ${formatNaira(mrr)}.`} />
      <div className="space-y-3">
        {(vendors ?? []).map((v) => {
          const last = (payments ?? []).find((p) => p.vendor_id === v.id);
          const overdue = v.next_billing_date && v.next_billing_date < today;
          return (
            <Card key={v.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {overdue && <Badge colour="red">Payment due {v.next_billing_date}</Badge>}
                {last && <span className="text-xs text-gray-500">Last paid {formatNaira(last.amount_kobo)} on {last.paid_on}</span>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={saveBilling.bind(null, v.id)} className="grid grid-cols-3 items-end gap-2">
                  <label className="text-xs text-gray-600">Setup fee ₦<Input name="setup_fee" defaultValue={v.setup_fee_kobo / 100} /></label>
                  <label className="text-xs text-gray-600">Monthly ₦<Input name="monthly_fee" defaultValue={v.monthly_fee_kobo / 100} /></label>
                  <label className="text-xs text-gray-600">Next bill<Input type="date" name="next_billing_date" defaultValue={v.next_billing_date ?? ""} /></label>
                  <SubmitButton variant="secondary" className="col-span-3 justify-self-start">Save plan</SubmitButton>
                </ActionForm>
                <ActionForm action={recordSubscriptionPayment.bind(null, v.id)} className="grid grid-cols-3 items-end gap-2">
                  <label className="text-xs text-gray-600">Amount ₦<Input name="amount" defaultValue={v.monthly_fee_kobo / 100 || ""} /></label>
                  <label className="text-xs text-gray-600">Paid on<Input type="date" name="paid_on" defaultValue={today} /></label>
                  <label className="text-xs text-gray-600">Note<Input name="note" /></label>
                  <SubmitButton className="col-span-3 justify-self-start">Record payment</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
