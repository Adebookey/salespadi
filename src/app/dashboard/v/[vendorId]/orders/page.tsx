import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Empty, OrderStatusBadge, PageHeader, cn, lagosDateTime } from "@/components/ui";
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

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="Orders" description="Every order from both channels." />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {filters.map(([id, label]) => (
          <Link key={id} href={`?s=${id}`} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm", (s ?? "open") === id ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200")}>{label}</Link>
        ))}
      </div>
      {orders.length === 0 ? <Empty title="No orders here" /> : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase text-gray-500">
              <tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Payment</th><th className="p-3">Status</th><th className="p-3">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium"><Link href={`/dashboard/v/${vendorId}/orders/${o.id}`} className="text-brand-700">#{o.number}</Link></td>
                  <td className="p-3">{o.customer_name ?? "-"}<div className="text-xs text-gray-500">{o.customer_phone}</div></td>
                  <td className="p-3">{formatNaira(o.total_kobo)}</td>
                  <td className="p-3 capitalize">{o.payment_method ?? "-"}</td>
                  <td className="p-3"><OrderStatusBadge status={o.status} /></td>
                  <td className="whitespace-nowrap p-3 text-gray-500">{lagosDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
