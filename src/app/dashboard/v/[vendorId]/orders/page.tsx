import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Empty, FilterChips, List, OrderStatusBadge, PageHeader, lagosDateTime } from "@/components/ui";
import { ShoppingBag } from "lucide-react";
import { formatNaira } from "@/lib/money";
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from "@/lib/types";

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ vendorId: string }>; searchParams: Promise<{ s?: string }> }) {
  const { vendorId } = await params;
  const s = (await searchParams).s as OrderStatus | "open" | undefined;
  const { supabase } = await getVendorForUser(vendorId);
  let q = supabase.from("orders").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(200);
  if (s === "open" || !s) q = q.in("status", ["pending", "awaiting_payment", "paid", "packed", "out_for_delivery"]);
  else if (s !== ("all" as string)) q = q.eq("status", s);
  const { data } = await q;
  const orders = (data ?? []) as Order[];
  const filters = [["open", "Open"], ...Object.entries(ORDER_STATUS_LABEL), ["all", "All"]];

  const base = `/dashboard/v/${vendorId}/orders`;
  const method = { paystack: "Card / bank", transfer: "Transfer", cod: "On delivery" } as const;

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="Orders" description="Every order from WhatsApp and Instagram." />
      <FilterChips active={s ?? "open"} items={filters.map(([id, label]) => ({ id, label, href: `?s=${id}` }))} />
      {orders.length === 0 ? <Empty icon={<ShoppingBag />} title="No orders here">Orders the assistant takes show up here.</Empty> : (
        <>
          {/* Phones: one card per order */}
          <List className="md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`${base}/${o.id}`} className="block px-4 py-3.5 transition hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-semibold text-fg">#{o.number}</span>
                    <span className="tabular text-[15px] font-semibold text-fg">{formatNaira(o.total_kobo)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-muted">{o.customer_name ?? "Customer"}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="mt-1 text-xs text-subtle">{lagosDateTime(o.created_at)}{o.payment_method ? ` · ${method[o.payment_method]}` : ""}</div>
                </Link>
              </li>
            ))}
          </List>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-xs font-medium text-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Order</th><th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th><th className="px-5 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="group relative transition hover:bg-surface-2">
                    <td className="px-5 py-3.5 font-semibold text-fg">
                      <Link href={`${base}/${o.id}`} className="after:absolute after:inset-0">#{o.number}</Link>
                    </td>
                    <td className="px-5 py-3.5"><div className="text-fg">{o.customer_name ?? "-"}</div><div className="text-xs text-subtle">{o.customer_phone}</div></td>
                    <td className="tabular px-5 py-3.5 text-right font-medium text-fg">{formatNaira(o.total_kobo)}</td>
                    <td className="px-5 py-3.5 text-muted">{o.payment_method ? method[o.payment_method] : "-"}</td>
                    <td className="px-5 py-3.5"><OrderStatusBadge status={o.status} /></td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-subtle">{lagosDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
