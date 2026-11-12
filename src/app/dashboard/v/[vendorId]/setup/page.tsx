import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Button, Card, Checkbox, Field, Input, Notice, Textarea, cn } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { faqsToText } from "@/lib/faqs";
import { env } from "@/lib/env";
import type { DeliveryZone, VendorSettings } from "@/lib/types";
import {
  addZone, connectInstagram, connectWhatsApp, deleteZone, disconnectChannel, saveBusiness, savePayments, savePolicies, saveVoice,
} from "../../../_actions/vendor";

const STEPS = [
  { id: "business", label: "1. Business" },
  { id: "voice", label: "2. Voice" },
  { id: "policies", label: "3. Policies & FAQs" },
  { id: "delivery", label: "4. Delivery" },
  { id: "payments", label: "5. Payments" },
  { id: "channels", label: "6. Channels" },
] as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SetupPage({ params, searchParams }: {
  params: Promise<{ vendorId: string }>; searchParams: Promise<{ step?: string }>;
}) {
  const { vendorId } = await params;
  const step = (await searchParams).step ?? "business";
  const { supabase, vendor } = await getVendorForUser(vendorId);
  const [{ data: s }, { data: zones }, { data: channels }] = await Promise.all([
    supabase.from("vendor_settings").select("*").eq("vendor_id", vendorId).single(),
    supabase.from("delivery_zones").select("*").eq("vendor_id", vendorId).order("fee_kobo"),
    supabase.from("channels").select("id, type, display_name, external_id, status").eq("vendor_id", vendorId).neq("status", "disabled"),
  ]);
  const settings = s as VendorSettings;
  const { data: canManage } = await supabase.rpc("is_vendor_owner", { v: vendorId });
  const idx = STEPS.findIndex((x) => x.id === step);
  const next = STEPS[idx + 1];
  const base = `/dashboard/v/${vendorId}/setup`;

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {STEPS.map((x) => (
          <Link key={x.id} href={`${base}?step=${x.id}`}
            className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", x.id === step ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-100")}>
            {x.label}
          </Link>
        ))}
      </nav>
      <Card>
        {step === "business" && (
          <ActionForm action={saveBusiness.bind(null, vendorId)}>
            <h2 className="font-medium">Business info</h2>
            {!canManage && <Notice tone="warn">Only the shop owner can change business info.</Notice>}
            <Field label="Business name"><Input name="name" defaultValue={vendor.name} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><Input name="city" defaultValue={vendor.city ?? ""} /></Field>
              <Field label="Instagram handle"><Input name="instagram_handle" defaultValue={vendor.instagram_handle ?? ""} placeholder="@kicksbytolu" /></Field>
              <Field label="Business phone"><Input name="business_phone" defaultValue={vendor.business_phone ?? ""} placeholder="0801 234 5678" /></Field>
              <Field label="Owner's WhatsApp" hint="Daily summary, payment alerts and chats that need a person go here. The owner can also send commands like CONFIRM 1042.">
                <Input name="owner_whatsapp" defaultValue={vendor.owner_whatsapp ?? ""} placeholder="0801 234 5678" />
              </Field>
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        {step === "voice" && (
          <ActionForm action={saveVoice.bind(null, vendorId)}>
            <h2 className="font-medium">How the AI should sound</h2>
            <Field label="Tone" hint="Describe it like you'd brief a new sales assistant.">
              <Textarea name="tone" defaultValue={settings.tone} rows={3} />
            </Field>
            <Checkbox name="pidgin_enabled" label="Reply in Pidgin when the customer writes in Pidgin" defaultChecked={settings.pidgin_enabled} />
            <Field label="First greeting"><Input name="greeting" defaultValue={settings.greeting ?? ""} placeholder="Hello dear, welcome to …" /></Field>
            <Field label="Sample replies" hint="One per line. Real messages the vendor has sent work best.">
              <Textarea name="sample_replies" defaultValue={settings.sample_replies.join("\n")} rows={4} />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        {step === "policies" && (
          <ActionForm action={savePolicies.bind(null, vendorId)}>
            <h2 className="font-medium">Policies, FAQs and handoff</h2>
            <Field label="Policies" hint="Returns, exchanges, delivery days, payment rules. The AI quotes only what's here.">
              <Textarea name="policies" defaultValue={settings.policies} rows={5} />
            </Field>
            <Field label="FAQs" hint="Question on the first line, answer below it, a blank line between FAQs.">
              <Textarea name="faqs" defaultValue={faqsToText(settings.faqs)} rows={8} />
            </Field>
            <Field label="Extra handoff rules" hint="When should the AI hand over to a person, besides complaints and refunds?">
              <Textarea name="handoff_rules" defaultValue={settings.handoff_rules} rows={2} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens"><Input type="time" name="open" defaultValue={settings.business_hours.open} /></Field>
              <Field label="Closes"><Input type="time" name="close" defaultValue={settings.business_hours.close} /></Field>
            </div>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => <Checkbox key={d} name="days" value={i} label={d} defaultChecked={settings.business_hours.days.includes(i)} />)}
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        {step === "delivery" && (
          <div className="space-y-5">
            <h2 className="font-medium">Delivery zones</h2>
            <ul className="divide-y divide-gray-100 rounded-lg ring-1 ring-gray-200">
              {((zones ?? []) as DeliveryZone[]).map((z) => (
                <li key={z.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="font-medium">{z.name} · {formatNaira(z.fee_kobo)}{z.eta ? ` · ${z.eta}` : ""}</div>
                    <div className="text-gray-500">{z.areas.join(", ") || "No areas listed"}</div>
                  </div>
                  <form action={deleteZone.bind(null, vendorId, z.id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>
                </li>
              ))}
              {!zones?.length && <li className="p-3 text-sm text-gray-500">No zones yet.</li>}
            </ul>
            <ActionForm action={addZone.bind(null, vendorId)}>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Zone name"><Input name="name" placeholder="Lagos Island" required /></Field>
                <Field label="Fee (₦)"><Input name="fee" placeholder="3500" required /></Field>
                <Field label="Delivery time"><Input name="eta" placeholder="1-2 days" /></Field>
              </div>
              <Field label="Areas in this zone" hint="Comma separated. The AI matches the customer's address to these.">
                <Input name="areas" placeholder="Lekki, Ajah, VI, Ikoyi" />
              </Field>
              <SubmitButton>Add zone</SubmitButton>
            </ActionForm>
          </div>
        )}

        {step === "payments" && (
          <ActionForm action={savePayments.bind(null, vendorId)}>
            <h2 className="font-medium">Payments and order sheet</h2>
            {!canManage && <Notice tone="warn">Only the shop owner can change payment details.</Notice>}
            <p className="text-sm text-gray-600">Bank transfer: the customer sends a receipt screenshot, the vendor confirms with one tap.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bank"><Input name="bank_name" defaultValue={vendor.bank_name ?? ""} placeholder="GTBank" /></Field>
              <Field label="Account number"><Input name="bank_account_number" defaultValue={vendor.bank_account_number ?? ""} inputMode="numeric" /></Field>
              <Field label="Account name"><Input name="bank_account_name" defaultValue={vendor.bank_account_name ?? ""} /></Field>
            </div>
            <Field label="Vendor's Paystack secret key" hint={<>Stored encrypted. {vendor.paystack_secret_enc ? "A key is saved; leave blank to keep it." : "Leave blank to skip card payments."} In Paystack settings, set the webhook URL to <code className="break-all">{env.appUrl}/api/webhooks/paystack/{vendorId}</code></>}>
              <Input name="paystack_secret" type="password" placeholder={vendor.paystack_secret_enc ? "•••••••• (saved)" : "sk_live_…"} autoComplete="off" />
            </Field>
            <Checkbox name="pay_on_delivery" label="Allow pay on delivery" defaultChecked={vendor.pay_on_delivery} />
            <Field label="Low-stock alert at" hint="Alert the vendor when an option drops to this many.">
              <Input name="low_stock_threshold" type="number" min={0} defaultValue={vendor.low_stock_threshold} className="max-w-28" />
            </Field>
            <Field label="Google Sheet for orders (optional)" hint={<>Paste the sheet link, then share the sheet with {env.googleServiceAccountEmail || "your Google service account email"} as an editor.</>}>
              <Input name="google_sheet_id" defaultValue={vendor.google_sheet_id ?? ""} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        )}

        {step === "channels" && (
          <div className="space-y-6">
            <h2 className="font-medium">Channels</h2>
            {!canManage && <Notice tone="warn">Only the shop owner can connect or disconnect channels.</Notice>}
            {(channels ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-brand-50 p-3 text-sm">
                <span>{c.status === "error" ? "⚠ " : "✔ "}{c.type === "whatsapp" ? "WhatsApp" : "Instagram"} {c.status === "error" ? "needs reconnecting (its access expired):" : "connected:"} <b>{c.display_name ?? c.external_id}</b></span>
                <form action={disconnectChannel.bind(null, vendorId, c.id)}><Button variant="ghost" className="text-red-600">Disconnect</Button></form>
              </div>
            ))}
            <Notice tone="info">
              In your Meta app, set the webhook URLs to <code className="break-all">{env.appUrl}/api/webhooks/whatsapp</code> and{" "}
              <code className="break-all">{env.appUrl}/api/webhooks/instagram</code>, with the verify token from META_VERIFY_TOKEN.
            </Notice>
            <ActionForm action={connectWhatsApp.bind(null, vendorId)}>
              <h3 className="text-sm font-medium">WhatsApp Cloud API number</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone number ID"><Input name="phone_number_id" required /></Field>
                <Field label="WhatsApp Business Account ID"><Input name="waba_id" required /></Field>
              </div>
              <Field label="Access token" hint="A permanent System User token with whatsapp_business_messaging and whatsapp_business_management permissions. Stored encrypted.">
                <Input name="access_token" type="password" required autoComplete="off" />
              </Field>
              <SubmitButton pendingText="Checking with Meta…">Connect WhatsApp</SubmitButton>
            </ActionForm>
            <ActionForm action={connectInstagram.bind(null, vendorId)}>
              <h3 className="text-sm font-medium">Instagram professional account</h3>
              <Field label="Instagram access token" hint="Long-lived token from Instagram Login with instagram_business_basic, instagram_business_manage_messages and instagram_business_manage_comments.">
                <Input name="access_token" type="password" required autoComplete="off" />
              </Field>
              <SubmitButton pendingText="Checking with Instagram…">Connect Instagram</SubmitButton>
            </ActionForm>
          </div>
        )}

        {next && (
          <div className="mt-6 border-t border-gray-100 pt-4 text-right">
            <Link href={`${base}?step=${next.id}`} className="text-sm font-medium text-brand-700">Next: {next.label.replace(/^\d\. /, "")} →</Link>
          </div>
        )}
      </Card>
    </div>
  );
}
