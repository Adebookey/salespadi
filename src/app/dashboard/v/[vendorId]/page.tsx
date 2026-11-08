import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { Button, Card, LinkButton, OrderStatusBadge, Stat, lagosDateTime } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import { daysAgo, lagosStartOfDay, type VendorStats } from "@/lib/services/reports";
import { setVendorStatus, toggleAI } from "../../_actions/vendor";
import type { Order } from "@/lib/types";

export default async function VendorOverview({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { supabase, vendor } = await getVendorForUser(vendorId);
  const weekAgo = daysAgo(7).toISOString();
  const [today, week, { data: recent }, { data: channels }, { count: products }, { count: zones }] = await Promise.all([
    supabase.rpc("vendor_stats", { p_vendor: vendorId, p_since: lagosStartOfDay().toISOString() }),
    supabase.rpc("vendor_stats", { p_vendor: vendorId, p_since: weekAgo }),
    supabase.from("orders").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(6),
    supabase.from("channels").select("type, display_name, status").eq("vendor_id", vendorId).neq("status", "disabled"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId).eq("is_active", true),
    supabase.from("delivery_zones").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId),
  ]);
  const t = (today.data ?? {}) as VendorStats;
  const w = (week.data ?? {}) as VendorStats;
  const base = `/dashboard/v/${vendorId}`;

  const checklist = [
    { done: (products ?? 0) > 0, label: "Add products", href: `${base}/catalog` },
    { done: (zones ?? 0) > 0, label: "Set delivery zones", href: `${base}/setup?step=delivery` },
    { done: Boolean(vendor.bank_account_number || vendor.paystack_secret_enc), label: "Set up payments", href: `${base}/setup?step=payments` },
    { done: (channels ?? []).some((c) => c.type === "whatsapp"), label: "Connect WhatsApp", href: `${base}/setup?step=channels` },
    { done: Boolean(vendor.owner_whatsapp), label: "Owner's WhatsApp for alerts", href: `${base}/setup?step=business` },
  ];

  return (
    <div className="space-y-6">
      {vendor.status !== "live" && (
        <Card>
          <h2 className="font-medium">Go-live checklist</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span className={c.done ? "text-brand-600" : "text-gray-300"}>{c.done ? "✔" : "○"}</span>
                <Link href={c.href} className={c.done ? "text-gray-500 line-through" : "text-gray-900 hover:underline"}>{c.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton variant="secondary" href={`${base}/studio`}>Test the AI first</LinkButton>
            <form action={setVendorStatus.bind(null, vendorId, "live")}>
              <Button disabled={!checklist.slice(0, 4).every((c) => c.done)}>Go live</Button>
            </form>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chats today" value={t.conversations ?? 0} hint={`${w.conversations ?? 0} this week`} />
        <Stat label="Orders today" value={t.orders ?? 0} hint={`${w.orders ?? 0} this week`} />
        <Stat label="Paid today" value={formatNaira(t.revenue_kobo)} hint={`${formatNaira(w.revenue_kobo)} this week`} />
        <Stat label="Waiting" value={t.needs_attention ?? 0} hint={`chats need a person · ${t.awaiting_payment ?? 0} unpaid`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Recent orders</h2>
            <Link href={`${base}/orders`} className="text-sm text-brand-700">All orders →</Link>
          </div>
          {(recent ?? []).length === 0 ? <p className="text-sm text-gray-500">No orders yet.</p> : (
            <ul className="divide-y divide-gray-100">
              {(recent as Order[]).map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <span><span className="font-medium">#{o.number}</span> · {o.customer_name ?? "Customer"}</span>
                    <span className="flex items-center gap-2"><span className="text-gray-600">{formatNaira(o.total_kobo)}</span><OrderStatusBadge status={o.status} /></span>
                  </Link>
                  <div className="-mt-1.5 pb-2 text-xs text-gray-500">{lagosDateTime(o.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="font-medium">AI assistant</h2>
            <p className="mt-1 text-sm text-gray-600">{vendor.ai_enabled ? "Replying to customers automatically." : "Paused: chats wait for a person."}</p>
            <form action={toggleAI.bind(null, vendorId, !vendor.ai_enabled)} className="mt-3">
              <Button variant={vendor.ai_enabled ? "secondary" : "primary"}>{vendor.ai_enabled ? "Pause AI" : "Resume AI"}</Button>
            </form>
          </div>
          <div>
            <h2 className="font-medium">Channels</h2>
            <ul className="mt-1 text-sm text-gray-600">
              {(channels ?? []).length === 0 && <li>None connected.</li>}
              {(channels ?? []).map((c) => <li key={c.type}>{c.type === "whatsapp" ? "WhatsApp" : "Instagram"}: {c.display_name}</li>)}
            </ul>
          </div>
          {w.top_products?.length ? (
            <div>
              <h2 className="font-medium">Top this week</h2>
              <ul className="mt-1 text-sm text-gray-600">{w.top_products.map((p) => <li key={p.name}>{p.name} · {p.qty} sold</li>)}</ul>
            </div>
          ) : null}
          {vendor.status === "live" && (
            <form action={setVendorStatus.bind(null, vendorId, "paused")}><Button variant="ghost" className="px-0 text-red-600">Pause this vendor</Button></form>
          )}
        </Card>
      </div>
    </div>
  );
}
