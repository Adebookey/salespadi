import { requireOperator } from "@/lib/auth";
import { Badge, List, PageHeader, Stat } from "@/components/ui";
import { Activity, Cpu, Wallet } from "lucide-react";
import { formatNaira } from "@/lib/money";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ rate?: string }> }) {
  const { supabase } = await requireOperator();
  const rate = Number((await searchParams).rate ?? process.env.USD_NGN_RATE ?? 1600);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const [{ data: usage }, { data: vendors }] = await Promise.all([
    supabase.from("ai_usage").select("vendor_id, model, input_tokens, output_tokens, cost_usd_micros").gte("created_at", start.toISOString()),
    supabase.from("vendors").select("id, name, monthly_fee_kobo"),
  ]);
  const byVendor = new Map<string, { cost: number; calls: number; tokens: number }>();
  for (const u of usage ?? []) {
    const v = byVendor.get(u.vendor_id) ?? { cost: 0, calls: 0, tokens: 0 };
    v.cost += u.cost_usd_micros / 1e6; v.calls++; v.tokens += u.input_tokens + u.output_tokens;
    byVendor.set(u.vendor_id, v);
  }
  const total = [...byVendor.values()].reduce((s, v) => s + v.cost, 0);
  const rows = (vendors ?? []).map((v) => ({ ...v, ...(byVendor.get(v.id) ?? { cost: 0, calls: 0, tokens: 0 }) })).sort((a, b) => b.cost - a.cost);

  const share = (r: (typeof rows)[number]) => {
    const costKobo = Math.round(r.cost * rate * 100);
    return { costKobo, pct: r.monthly_fee_kobo ? Math.round((costKobo / r.monthly_fee_kobo) * 100) : null };
  };
  const tone = (pct: number) => (pct > 30 ? "red" : pct > 15 ? "amber" : "green");

  return (
    <>
      <PageHeader title="AI costs this month" description={<>Claude spend per vendor against what they pay you, at ₦{rate.toLocaleString()}/$ (set <code className="text-xs">USD_NGN_RATE</code> to change).</>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total AI cost" value={`$${total.toFixed(2)}`} hint={formatNaira(Math.round(total * rate * 100))} icon={<Cpu />} />
        <Stat label="AI calls" value={(usage ?? []).length.toLocaleString()} icon={<Activity />} />
        <Stat label="Monthly fees" value={formatNaira(rows.reduce((s, r) => s + (r.monthly_fee_kobo ?? 0), 0))} icon={<Wallet />} />
      </div>

      <List className="md:hidden">
        {rows.map((r) => {
          const { costKobo, pct } = share(r);
          return (
            <li key={r.id} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-fg">{r.name}</span>
                <span className="tabular font-semibold text-fg">${r.cost.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-subtle">
                <span className="tabular">{r.calls} calls · {formatNaira(costKobo)} of {formatNaira(r.monthly_fee_kobo)}</span>
                {pct !== null && <Badge colour={tone(pct)}>{pct}% of fee</Badge>}
              </div>
            </li>
          );
        })}
      </List>

      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-2/60 text-xs text-subtle">
            <tr>
              <th className="px-5 py-3 font-medium">Vendor</th><th className="px-5 py-3 text-right font-medium">Calls</th>
              <th className="px-5 py-3 text-right font-medium">Tokens</th><th className="px-5 py-3 text-right font-medium">AI cost</th>
              <th className="px-5 py-3 text-right font-medium">Monthly fee</th><th className="px-5 py-3 text-right font-medium">AI share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const { costKobo, pct } = share(r);
              return (
                <tr key={r.id}>
                  <td className="px-5 py-3.5 font-medium text-fg">{r.name}</td>
                  <td className="tabular px-5 py-3.5 text-right text-muted">{r.calls}</td>
                  <td className="tabular px-5 py-3.5 text-right text-muted">{r.tokens.toLocaleString()}</td>
                  <td className="tabular px-5 py-3.5 text-right text-fg">${r.cost.toFixed(3)} <span className="text-subtle">({formatNaira(costKobo)})</span></td>
                  <td className="tabular px-5 py-3.5 text-right text-fg">{formatNaira(r.monthly_fee_kobo)}</td>
                  <td className="px-5 py-3.5 text-right">{pct === null ? <span className="text-subtle">-</span> : <Badge colour={tone(pct)}>{pct}%</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
