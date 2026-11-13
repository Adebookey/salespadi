import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { CheckCircle2, ChevronRight, Circle, MessageCircle, MessageCircleWarning, Pause, Play, ShoppingBag, Sparkles, Wallet } from "lucide-react";
import { Button, Card, CardHeader, LinkButton, OrderStatusBadge, Stat, lagosDateTime } from "@/components/ui";
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
  const { data: canManage } = await supabase.rpc("is_vendor_owner", { v: vendorId });
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

  const channelLabel = { whatsapp: "WhatsApp", instagram: "Instagram" } as const;
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {vendor.status !== "live" && (
        <Card>
          <CardHeader title="Get ready to go live" description={`${doneCount} of ${checklist.length} done`} />
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
          </div>
          <ul className="-mx-2 space-y-0.5">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-[15px] transition hover:bg-surface-2 sm:text-sm">
                  {c.done
                    ? <CheckCircle2 className="size-5 shrink-0 text-accent-text" />
                    : <Circle className="size-5 shrink-0 text-line-strong" />}
                  <span className={c.done ? "flex-1 text-subtle line-through" : "flex-1 text-fg"}>{c.label}</span>
                  {!c.done && <ChevronRight className="size-4 text-subtle" />}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <LinkButton variant="secondary" href={`${base}/studio`}><Sparkles className="size-4" /> Test the AI first</LinkButton>
            {canManage && (
              <form action={setVendorStatus.bind(null, vendorId, "live")}>
                <Button className="w-full" disabled={!checklist.slice(0, 4).every((c) => c.done)}>Go live</Button>
              </form>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chats today" value={t.conversations ?? 0} hint={`${w.conversations ?? 0} this week`} icon={<MessageCircle />} />
        <Stat label="Orders today" value={t.orders ?? 0} hint={`${w.orders ?? 0} this week`} icon={<ShoppingBag />} />
        <Stat label="Paid today" value={formatNaira(t.revenue_kobo)} hint={`${formatNaira(w.revenue_kobo)} this week`} icon={<Wallet />} />
        <Link href={`${base}/inbox?f=attention`} className="block rounded-xl transition hover:opacity-90">
          <Stat label="Needs you" value={t.needs_attention ?? 0} hint={`${t.awaiting_payment ?? 0} order(s) unpaid`} icon={<MessageCircleWarning />} />
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="self-start p-0 sm:p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-[15px] font-semibold text-fg">Recent orders</h2>
            <Link href={`${base}/orders`} className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-text">All orders <ChevronRight className="size-4" /></Link>
          </div>
          {(recent ?? []).length === 0 ? <p className="px-4 pb-5 text-sm text-muted sm:px-5">No orders yet.</p> : (
            <ul className="divide-y divide-line">
              {(recent as Order[]).map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] text-fg sm:text-sm"><span className="font-medium">#{o.number}</span> · {o.customer_name ?? "Customer"}</div>
                      <div className="text-xs text-subtle">{lagosDateTime(o.created_at)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular text-sm font-medium text-fg">{formatNaira(o.total_kobo)}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="AI assistant" description={vendor.ai_enabled ? "Replying to customers automatically." : "Paused: new chats wait for a person."}
              action={<span className={`mt-1 inline-block size-2.5 rounded-full ${vendor.ai_enabled ? "bg-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.15)]" : "bg-red-500"}`} />} />
            {canManage ? (
              <form action={toggleAI.bind(null, vendorId, !vendor.ai_enabled)}>
                <Button className="w-full" variant={vendor.ai_enabled ? "secondary" : "primary"}>
                  {vendor.ai_enabled ? <><Pause className="size-4" /> Pause AI</> : <><Play className="size-4" /> Resume AI</>}
                </Button>
              </form>
            ) : <p className="text-xs text-subtle">The shop owner can pause or resume it.</p>}
          </Card>
          <Card>
            <CardHeader title="Channels" action={<Link href={`${base}/setup?step=channels`} className="text-sm font-medium text-accent-text">Manage</Link>} />
            <ul className="space-y-2.5 text-sm">
              {(channels ?? []).length === 0 && <li className="text-muted">None connected yet.</li>}
              {(channels ?? []).map((c) => (
                <li key={c.type} className="flex items-center justify-between gap-2">
                  <span className="text-muted">{channelLabel[c.type as keyof typeof channelLabel]}</span>
                  <span className="truncate font-medium text-fg">{c.display_name}</span>
                </li>
              ))}
            </ul>
          </Card>
          {w.top_products?.length ? (
            <Card>
              <CardHeader title="Top this week" />
              <ol className="space-y-2.5 text-sm">
                {w.top_products.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className="tabular flex size-6 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold text-muted">{i + 1}</span>
                    <span className="flex-1 truncate text-fg">{p.name}</span>
                    <span className="tabular text-muted">{p.qty} sold</span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
          {vendor.status === "live" && canManage && (
            <form action={setVendorStatus.bind(null, vendorId, "paused")}>
              <Button variant="danger-ghost" size="sm" className="w-full">Pause this vendor</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
