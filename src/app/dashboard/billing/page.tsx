import { requireOperator } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, Card, Field, Input, PageHeader, Stat } from "@/components/ui";
import { CalendarClock, Repeat } from "lucide-react";
import { formatNaira } from "@/lib/money";
import { recordSubscriptionPayment, saveBilling } from "../_actions/vendor";

export default async function BillingPage() {
  const { supabase } = await requireOperator();
  const [{ data: vendors }, { data: payments }] = await Promise.all([
    supabase.from("vendors").select("id, name, status, setup_fee_kobo, monthly_fee_kobo, next_billing_date, ai_daily_budget_usd").order("next_billing_date", { nullsFirst: false }),
    supabase.from("subscription_payments").select("vendor_id, amount_kobo, paid_on").order("paid_on", { ascending: false }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const mrr = (vendors ?? []).filter((v) => v.status === "live").reduce((s, v) => s + v.monthly_fee_kobo, 0);

  return (
    <>
      <PageHeader title="Billing" description="What each vendor pays you, and when." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Monthly recurring" value={formatNaira(mrr)} hint="From live vendors" icon={<Repeat />} />
        <Stat label="Payment due" value={(vendors ?? []).filter((v) => v.next_billing_date && v.next_billing_date < today).length} hint="Vendors past their bill date" icon={<CalendarClock />} />
      </div>
      <div className="space-y-4">
        {(vendors ?? []).map((v) => {
          const last = (payments ?? []).find((p) => p.vendor_id === v.id);
          const overdue = v.next_billing_date && v.next_billing_date < today;
          return (
            <Card key={v.id} className="p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-3.5 sm:px-5">
                <Avatar name={v.name} className="size-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{v.name}</div>
                  <div className="text-xs text-subtle">{last ? `Last paid ${formatNaira(last.amount_kobo)} on ${last.paid_on}` : "No payments recorded"}</div>
                </div>
                {overdue ? <Badge colour="red">Due {v.next_billing_date}</Badge> : v.next_billing_date ? <Badge>Next {v.next_billing_date}</Badge> : null}
              </div>
              <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
                <ActionForm action={saveBilling.bind(null, v.id)} className="space-y-3 p-4 sm:p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Plan</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Setup fee (₦)"><Input name="setup_fee" inputMode="decimal" defaultValue={v.setup_fee_kobo / 100} /></Field>
                    <Field label="Monthly (₦)"><Input name="monthly_fee" inputMode="decimal" defaultValue={v.monthly_fee_kobo / 100} /></Field>
                    <Field label="Next bill"><Input type="date" name="next_billing_date" defaultValue={v.next_billing_date ?? ""} /></Field>
                    <Field label="AI cap ($/day)"><Input name="ai_daily_budget_usd" inputMode="decimal" defaultValue={v.ai_daily_budget_usd} /></Field>
                  </div>
                  <p className="text-xs text-subtle">When a shop&apos;s AI spend reaches its cap in a day, new chats wait for a person.</p>
                  <SubmitButton variant="secondary">Save plan</SubmitButton>
                </ActionForm>
                <ActionForm action={recordSubscriptionPayment.bind(null, v.id)} className="space-y-3 p-4 sm:p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Record a payment</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount (₦)"><Input name="amount" inputMode="decimal" defaultValue={v.monthly_fee_kobo / 100 || ""} /></Field>
                    <Field label="Paid on"><Input type="date" name="paid_on" defaultValue={today} /></Field>
                    <Field label="Note" className="col-span-2"><Input name="note" placeholder="Optional" /></Field>
                  </div>
                  <SubmitButton>Record payment</SubmitButton>
                </ActionForm>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
