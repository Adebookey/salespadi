import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MessageCircleWarning, Plus, Receipt, Store, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Avatar, Badge, Empty, LinkButton, List, PageHeader, Stat } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import type { Vendor } from "@/lib/types";
import { lagosStartOfDay } from "@/lib/services/reports";

const STATUS = { live: { tone: "green", label: "Live" }, onboarding: { tone: "amber", label: "Onboarding" }, paused: { tone: "red", label: "Paused" } } as const;

export default async function DashboardHome() {
  const { supabase, isOperator } = await getSession();
  const { data } = await supabase.from("vendors").select("*").order("created_at", { ascending: false });
  const vendors = (data ?? []) as Vendor[];

  if (!isOperator) {
    if (vendors.length === 1) redirect(`/dashboard/v/${vendors[0].id}`);
    if (!vendors.length) return <Empty icon={<Store />} title="No shop yet">Ask your SalesPadi manager to add you to your shop.</Empty>;
  }

  const since = lagosStartOfDay();
  const [{ data: paidToday }, { data: attention }] = await Promise.all([
    supabase.from("orders").select("total_kobo").gte("paid_at", since.toISOString()),
    supabase.from("conversations").select("vendor_id").eq("needs_attention", true),
  ]);
  const attentionBy = new Map<string, number>();
  (attention ?? []).forEach((c) => attentionBy.set(c.vendor_id, (attentionBy.get(c.vendor_id) ?? 0) + 1));
  const live = vendors.filter((v) => v.status === "live").length;

  return (
    <>
      <PageHeader
        title={isOperator ? "Vendors" : "Your shops"}
        description={isOperator ? "Every business you run SalesPadi for." : undefined}
        actions={isOperator && <LinkButton href="/dashboard/vendors/new"><Plus className="size-4" /> Add vendor</LinkButton>}
      />
      {isOperator && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Live vendors" value={live} hint={`${vendors.length} in total`} icon={<Store />} />
          <Link href="/dashboard/escalations" className="block rounded-xl transition hover:opacity-90">
            <Stat label="Need a person" value={attention?.length ?? 0} hint="Open the queue →" icon={<MessageCircleWarning />} />
          </Link>
          <Stat label="Paid orders today" value={paidToday?.length ?? 0} icon={<Receipt />} />
          <Stat label="Sales today" value={formatNaira((paidToday ?? []).reduce((s, o) => s + o.total_kobo, 0))} icon={<Wallet />} />
        </div>
      )}
      {vendors.length === 0 ? (
        <Empty icon={<Store />} title="No vendors yet" action={<LinkButton href="/dashboard/vendors/new"><Plus className="size-4" /> Add your first vendor</LinkButton>}>
          Add a business to start onboarding them.
        </Empty>
      ) : (
        <List>
          {vendors.map((v) => {
            const s = STATUS[v.status];
            const waiting = attentionBy.get(v.id) ?? 0;
            return (
              <li key={v.id}>
                <Link href={`/dashboard/v/${v.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2 sm:px-5">
                  <Avatar name={v.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{v.name}</div>
                    <div className="truncate text-sm text-subtle">{[v.instagram_handle && `@${v.instagram_handle}`, v.city].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    {waiting > 0 && <Badge colour="amber">{waiting} waiting</Badge>}
                    {!v.ai_enabled && <Badge colour="red">AI paused</Badge>}
                    <Badge colour={s.tone}>{s.label}</Badge>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-subtle" />
                </Link>
              </li>
            );
          })}
        </List>
      )}
    </>
  );
}
