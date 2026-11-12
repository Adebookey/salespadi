// Rider page: no login. The unguessable token in the link is the permission to update this one order.
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { updateOrderStatus } from "@/lib/services/orders";
import { Button, Card, OrderStatusBadge } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import type { Order, OrderItem } from "@/lib/types";

export const metadata = { title: "Delivery", robots: { index: false } };

async function load(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await adminClient().from("orders").select("*, items:order_items(*), vendor:vendors(name)").eq("rider_token", token).maybeSingle();
  return data as (Order & { items: OrderItem[]; vendor: { name: string } }) | null;
}

/** Riders handle paid orders, and pay-on-delivery orders that haven't been cancelled or delivered. */
function riderCanUpdate(o: Order) {
  if (["paid", "packed", "out_for_delivery"].includes(o.status)) return true;
  return o.payment_method === "cod" && ["pending", "awaiting_payment"].includes(o.status);
}

async function update(token: string, status: "out_for_delivery" | "delivered") {
  "use server";
  const o = await load(token);
  if (!o || !riderCanUpdate(o)) return;
  await updateOrderStatus(adminClient(), o.id, status, null);
  revalidatePath(`/r/${token}`);
}

export default async function RiderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const o = await load(token);
  if (!o) notFound();
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><h1 className="text-lg font-semibold">{o.vendor.name} · #{o.number}</h1><OrderStatusBadge status={o.status} /></div>
        <div className="text-sm">
          <div className="font-medium">{o.customer_name}</div>
          {o.customer_phone && <a href={`tel:${o.customer_phone}`} className="text-brand-700">{o.customer_phone}</a>}
          <p className="mt-1 text-gray-700">{o.delivery_address}</p>
          {o.delivery_address && <a className="text-xs text-brand-700" href={`https://maps.google.com/?q=${encodeURIComponent(o.delivery_address)}`}>Open in Maps</a>}
        </div>
        <ul className="text-sm text-gray-700">{o.items.map((i) => <li key={i.id}>{i.quantity} × {i.name}{i.variant_label ? ` (${i.variant_label})` : ""}</li>)}</ul>
        {o.payment_method === "cod" && !o.paid_at && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">Collect {formatNaira(o.total_kobo)} on delivery.</p>}
        {!riderCanUpdate(o) && o.status !== "delivered" && <p className="rounded bg-gray-100 p-2 text-sm text-gray-700">This order is {o.status === "cancelled" ? "cancelled" : "not ready for delivery yet"}.</p>}
        <div className={riderCanUpdate(o) ? "flex gap-2" : "hidden"}>
          {o.status !== "out_for_delivery" && o.status !== "delivered" && <form action={update.bind(null, token, "out_for_delivery")}><Button variant="secondary">I&apos;ve picked it up</Button></form>}
          {o.status !== "delivered" && <form action={update.bind(null, token, "delivered")}><Button>Delivered</Button></form>}
        </div>
      </Card>
    </main>
  );
}
