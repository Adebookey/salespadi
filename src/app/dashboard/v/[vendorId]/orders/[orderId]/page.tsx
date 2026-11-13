import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, CardHeader, Field, Input, OrderStatusBadge, lagosDateTime } from "@/components/ui";
import { Check, ChevronLeft, Clock, Link2, MapPin, MessageCircle, Phone, StickyNote, UserRound } from "lucide-react";
import { formatNaira } from "@/lib/money";
import { env } from "@/lib/env";
import type { Order, OrderItem, OrderStatus, Payment } from "@/lib/types";
import { assignRider, confirmTransfer, rejectTransfer, sendPaymentLink, setOrderStatus } from "../../../../_actions/orders";

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }[]>> = {
  pending: [{ to: "cancelled", label: "Cancel" }],
  awaiting_payment: [{ to: "cancelled", label: "Cancel" }],
  paid: [{ to: "packed", label: "Mark packed" }, { to: "cancelled", label: "Cancel" }],
  packed: [{ to: "out_for_delivery", label: "Out for delivery" }],
  out_for_delivery: [{ to: "delivered", label: "Mark delivered" }],
};

export default async function OrderPage({ params }: { params: Promise<{ vendorId: string; orderId: string }> }) {
  const { vendorId, orderId } = await params;
  const { supabase } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("orders").select("*, items:order_items(*), payments(*), zone:delivery_zones(name)")
    .eq("id", orderId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) notFound();
  const o = data as Order & { items: OrderItem[]; payments: Payment[]; zone: { name: string } | null };
  const proofs = o.payments.filter((p) => p.proof_url);
  const signed = new Map<string, string>();
  if (proofs.length) {
    const { data: urls } = await adminClient().storage.from("chat-media").createSignedUrls(proofs.map((p) => p.proof_url!), 3600);
    urls?.forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }
  const pendingTransfer = o.payments.find((p) => p.method === "transfer" && p.status === "pending");
  const unpaid = !o.paid_at && o.status !== "cancelled" && o.status !== "delivered";
  const awaiting = o.status === "pending" || o.status === "awaiting_payment";
  // Pay on delivery: the order goes out before it is paid.
  const next = o.payment_method === "cod" && awaiting
    ? [{ to: "packed" as OrderStatus, label: "Mark packed" }, { to: "out_for_delivery" as OrderStatus, label: "Out for delivery" }, { to: "cancelled" as OrderStatus, label: "Cancel" }]
    : (NEXT[o.status] ?? []);
  const setStatus = setOrderStatus.bind(null, vendorId, orderId);

  const methodLabel = { paystack: "Card / bank (Paystack)", transfer: "Bank transfer", cod: "Pay on delivery" } as const;
  const paymentStatusTone = { success: "green", pending: "amber", failed: "red", rejected: "red" } as const;
  const primaryNext = next.filter((n) => n.to !== "cancelled");
  const canCancel = next.some((n) => n.to === "cancelled");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div>
          <Link href={`/dashboard/v/${vendorId}/orders`} className="-ml-1 mb-2 inline-flex items-center gap-0.5 text-sm text-muted hover:text-fg">
            <ChevronLeft className="size-4" /> Orders
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-fg">Order #{o.number}</h2>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="mt-1 text-sm text-subtle">Placed {lagosDateTime(o.created_at)}</p>
        </div>

        <Card>
          <CardHeader title="Items" />
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="text-[15px] text-fg sm:text-sm">{i.name}</div>
                  <div className="text-xs text-subtle">{[i.variant_label, `Qty ${i.quantity}`].filter(Boolean).join(" · ")}</div>
                </div>
                <span className="tabular shrink-0 text-[15px] text-fg sm:text-sm">{formatNaira(i.unit_price_kobo * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular text-fg">{formatNaira(o.subtotal_kobo)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Delivery{o.zone ? ` · ${o.zone.name}` : ""}</dt><dd className="tabular text-fg">{formatNaira(o.delivery_fee_kobo)}</dd></div>
            <div className="flex justify-between pt-1 text-base font-semibold"><dt className="text-fg">Total</dt><dd className="tabular text-fg">{formatNaira(o.total_kobo)}</dd></div>
          </dl>
          {(primaryNext.length > 0 || canCancel) && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {primaryNext.map((n, idx) => (
                <form key={n.to} action={setStatus.bind(null, n.to)} className="sm:flex-none">
                  <Button className="w-full" variant={idx === 0 ? "primary" : "secondary"}>{n.label}</Button>
                </form>
              ))}
              {canCancel && (
                <form action={setStatus.bind(null, "cancelled")} className="sm:ml-auto">
                  <Button className="w-full" variant="danger-ghost">Cancel order</Button>
                </form>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-subtle">The customer gets a WhatsApp or Instagram update at each step.</p>
        </Card>

        <Card>
          <CardHeader title="Payment"
            description={<>{o.payment_method ? methodLabel[o.payment_method] : "Not chosen yet"}{o.paid_at ? ` · paid ${lagosDateTime(o.paid_at)}` : ""}</>} />
          {o.payments.length > 0 && (
            <ul className="space-y-3">
              {o.payments.map((p) => (
                <li key={p.id} className="rounded-xl border border-line bg-surface-2/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular text-sm font-medium text-fg">{methodLabel[p.method]} · {formatNaira(p.amount_kobo)}</span>
                    <Badge colour={paymentStatusTone[p.status]}>{p.status === "pending" && p.proof_url ? "Receipt sent" : p.status[0].toUpperCase() + p.status.slice(1)}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-subtle">Ref {p.reference}</div>
                  {p.proof_url && signed.get(p.proof_url) && (
                    <a href={signed.get(p.proof_url)} target="_blank" rel="noreferrer" className="mt-3 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={signed.get(p.proof_url)} alt="Transfer receipt" className="max-h-80 w-full rounded-lg object-contain ring-1 ring-line sm:w-auto" />
                    </a>
                  )}
                  {p.method === "transfer" && p.status === "pending" && awaiting && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <form action={confirmTransfer.bind(null, vendorId, orderId, p.id)}><Button className="w-full"><Check className="size-4" /> Payment received</Button></form>
                      <form action={rejectTransfer.bind(null, vendorId, orderId, p.id)}><Button className="w-full" variant="secondary">Not received</Button></form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unpaid && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {awaiting && o.payment_method !== "cod" && (
                <ActionForm action={sendPaymentLink.bind(null, vendorId, orderId)} className="space-y-2">
                  <SubmitButton className="w-full" variant="secondary" pendingText="Sending…"><Link2 className="size-4" /> Send Paystack link</SubmitButton>
                </ActionForm>
              )}
              {!pendingTransfer && (
                <form action={confirmTransfer.bind(null, vendorId, orderId, null)}>
                  <Button className="w-full" variant="secondary">{o.payment_method === "cod" ? "Cash collected" : "Mark paid manually"}</Button>
                </form>
              )}
            </div>
          )}
          {awaiting && o.payment_method !== "cod" && (
            <p className="mt-3 flex gap-2 text-xs leading-relaxed text-subtle"><Clock className="mt-px size-3.5 shrink-0" />The items are held for 48 hours. If unpaid by then, the order is cancelled and the stock goes back on sale.</p>
          )}
        </Card>
      </div>

      <div className="space-y-5 lg:pt-[76px]">
        <Card>
          <CardHeader title="Delivery" />
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3"><UserRound className="mt-0.5 size-4 shrink-0 text-subtle" /><span className="text-fg">{o.customer_name ?? "-"}</span></div>
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-subtle" /><span className="text-fg">{o.delivery_address ?? "-"}</span></div>
            {o.notes && <div className="flex items-start gap-3"><StickyNote className="mt-0.5 size-4 shrink-0 text-subtle" /><span className="text-muted">{o.notes}</span></div>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {o.customer_phone && <a href={`tel:${o.customer_phone}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2"><Phone className="size-4" /> Call</a>}
            {o.conversation_id && <Link href={`/dashboard/v/${vendorId}/inbox/${o.conversation_id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2"><MessageCircle className="size-4" /> Chat</Link>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Rider" description="The rider marks the order picked up and delivered from a link, no login needed." />
          <ActionForm action={assignRider.bind(null, vendorId, orderId)} className="space-y-3">
            <Field label="Rider name"><Input name="rider_name" defaultValue={o.rider_name ?? ""} /></Field>
            <Field label="Rider phone"><Input name="rider_phone" type="tel" defaultValue={o.rider_phone ?? ""} /></Field>
            <SubmitButton className="w-full" variant="secondary">Save rider</SubmitButton>
          </ActionForm>
          <p className="mt-3 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-muted">{env.appUrl}/r/{o.rider_token}</p>
        </Card>
      </div>
    </div>
  );
}
