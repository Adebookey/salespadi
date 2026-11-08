import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";
import { formatNaira } from "@/lib/money";
import type { Vendor } from "@/lib/types";

export default async function DashboardHome() {
  const { supabase, isOperator } = await getSession();
  const { data } = await supabase.from("vendors").select("*").order("created_at", { ascending: false });
  const vendors = (data ?? []) as Vendor[];

  if (!isOperator) {
    if (vendors.length === 1) redirect(`/dashboard/v/${vendors[0].id}`);
    if (!vendors.length) return <Empty title="No shop yet">Ask your SalesPadi manager to add you to your shop.</Empty>;
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [{ count: escalations }, { data: paidToday }, { count: liveCount }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("needs_attention", true),
    supabase.from("orders").select("total_kobo").gte("paid_at", since.toISOString()),
    supabase.from("vendors").select("id", { count: "exact", head: true }).eq("status", "live"),
  ]);
  const { data: attention } = await supabase.from("conversations").select("vendor_id").eq("needs_attention", true);
  const attentionBy = new Map<string, number>();
  (attention ?? []).forEach((c) => attentionBy.set(c.vendor_id, (attentionBy.get(c.vendor_id) ?? 0) + 1));

  return (
    <>
      <PageHeader
        title={isOperator ? "Vendors" : "Your shops"}
        description={isOperator ? "Every business you run SalesPadi for." : undefined}
        actions={isOperator && <LinkButton href="/dashboard/vendors/new">Add vendor</LinkButton>}
      />
      {isOperator && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Vendors live" value={liveCount ?? 0} hint={`${vendors.length} total`} />
          <Stat label="Need a person" value={escalations ?? 0} hint={<Link className="text-brand-700" href="/dashboard/escalations">Open queue →</Link>} />
          <Stat label="Paid orders today" value={paidToday?.length ?? 0} />
          <Stat label="Sales today" value={formatNaira((paidToday ?? []).reduce((s, o) => s + o.total_kobo, 0))} />
        </div>
      )}
      {vendors.length === 0 ? (
        <Empty title="No vendors yet">Add your first vendor to start onboarding.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <Link key={v.id} href={`/dashboard/v/${v.id}`}>
              <Card className="h-full transition hover:ring-brand-500">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">{v.name}</div>
                    <div className="text-sm text-gray-500">{v.instagram_handle ? `@${v.instagram_handle}` : v.city ?? ""}</div>
                  </div>
                  <Badge colour={v.status === "live" ? "green" : v.status === "paused" ? "red" : "amber"}>{v.status}</Badge>
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  {!v.ai_enabled && <Badge colour="red">AI paused</Badge>}
                  {(attentionBy.get(v.id) ?? 0) > 0 && <Badge colour="amber">{attentionBy.get(v.id)} need a person</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
