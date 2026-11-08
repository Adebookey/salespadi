import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Field, Input, OrderStatusBadge, lagosDateTime } from "@/components/ui";
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
  const unpaid = o.status === "pending" || o.status === "awaiting_payment";
  const setStatus = setOrderStatus.bind(null, vendorId, orderId);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href={`/dashboard/v/${vendorId}/orders`} className="text-xs text-gray-500">← Orders</Link>
              <h2 className="text-lg font-semibold">Order #{o.number}</h2>
              <div className="text-sm text-gray-500">{lagosDateTime(o.created_at)}</div>
            </div>
            <OrderStatusBadge status={o.status} />
          </div>
          <table className="mt-4 w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {o.items.map((i) => (
                <tr key={i.id}><td className="py-2">{i.quantity} × {i.name}{i.variant_label ? <span className="text-gray-500"> ({i.variant_label})</span> : null}</td><td className="py-2 text-right">{formatNaira(i.unit_price_kobo * i.quantity)}</td></tr>
              ))}
              <tr><td className="py-2 text-gray-600">Delivery{o.zone ? ` (${o.zone.name})` : ""}</td><td className="py-2 text-right">{formatNaira(o.delivery_fee_kobo)}</td></tr>
              <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{formatNaira(o.total_kobo)}</td></tr>
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap gap-2">
            {(NEXT[o.status] ?? []).map((n) => (
              <form key={n.to} action={setStatus.bind(null, n.to)}><Button variant={n.to === "cancelled" ? "ghost" : "primary"} className={n.to === "cancelled" ? "text-red-600" : ""}>{n.label}</Button></form>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">The customer gets a WhatsApp/Instagram update at each step.</p>
        </Card>

        <Card>
          <h2 className="font-medium">Payment</h2>
          <p className="mt-1 text-sm text-gray-600">Method: <span className="capitalize">{o.payment_method ?? "not chosen yet"}</span>{o.paid_at ? ` · paid ${lagosDateTime(o.paid_at)}` : ""}</p>
          <ul className="mt-3 space-y-3">
            {o.payments.map((p) => (
              <li key={p.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="capitalize">{p.method} · {formatNaira(p.amount_kobo)}</span>
                  <Badge colour={p.status === "success" ? "green" : p.status === "pending" ? "amber" : "red"}>{p.status}</Badge>
                </div>
                <div className="text-xs text-gray-500">Ref {p.reference}</div>
                {p.proof_url && signed.get(p.proof_url) && (
                  <a href={signed.get(p.proof_url)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signed.get(p.proof_url)} alt="Transfer receipt" className="mt-2 max-h-72 rounded ring-1 ring-gray-200" />
                  </a>
                )}
                {p.method === "transfer" && p.status === "pending" && unpaid && (
                  <div className="mt-2 flex gap-2">
                    <form action={confirmTransfer.bind(null, vendorId, orderId, p.id)}><Button>Confirm payment received</Button></form>
                    <form action={rejectTransfer.bind(null, vendorId, orderId, p.id)}><Button variant="secondary">Not received</Button></form>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {unpaid && (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionForm action={sendPaymentLink.bind(null, vendorId, orderId)} className="space-y-2">
                <SubmitButton variant="secondary" pendingText="Sending…">Send Paystack link</SubmitButton>
              </ActionForm>
              {!pendingTransfer && <form action={confirmTransfer.bind(null, vendorId, orderId, null)}><Button variant="secondary">Mark paid manually</Button></form>}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <h2 className="font-medium">Delivery</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div><dt className="inline text-gray-500">Name: </dt><dd className="inline">{o.customer_name}</dd></div>
            <div><dt className="inline text-gray-500">Phone: </dt><dd className="inline">{o.customer_phone ? <a className="text-brand-700" href={`tel:${o.customer_phone}`}>{o.customer_phone}</a> : "-"}</dd></div>
            <div><dt className="inline text-gray-500">Address: </dt><dd className="inline">{o.delivery_address}</dd></div>
            {o.notes && <div><dt className="inline text-gray-500">Notes: </dt><dd className="inline">{o.notes}</dd></div>}
          </dl>
        </Card>
        <Card>
          <h2 className="font-medium">Rider</h2>
          <ActionForm action={assignRider.bind(null, vendorId, orderId)} className="mt-2 space-y-3">
            <Field label="Rider name"><Input name="rider_name" defaultValue={o.rider_name ?? ""} /></Field>
            <Field label="Rider phone"><Input name="rider_phone" defaultValue={o.rider_phone ?? ""} /></Field>
            <SubmitButton variant="secondary">Save rider</SubmitButton>
          </ActionForm>
          <p className="mt-3 break-all text-xs text-gray-500">Rider link: {env.appUrl}/r/{o.rider_token}</p>
        </Card>
        {o.conversation_id && <Link href={`/dashboard/v/${vendorId}/inbox/${o.conversation_id}`} className="block text-sm text-brand-700">Open the chat →</Link>}
      </div>
    </div>
  );
}
