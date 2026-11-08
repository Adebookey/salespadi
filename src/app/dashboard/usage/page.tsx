import { requireOperator } from "@/lib/auth";
import { Card, PageHeader, Stat } from "@/components/ui";
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

  return (
    <>
      <PageHeader title="AI costs this month" description={<>Claude API spend per vendor, against what they pay you. Exchange rate used: ₦{rate}/$ (set USD_NGN_RATE, or add ?rate=… to the URL).</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total AI cost" value={`$${total.toFixed(2)}`} hint={formatNaira(Math.round(total * rate * 100))} />
        <Stat label="AI calls" value={(usage ?? []).length} />
        <Stat label="Monthly fees" value={formatNaira(rows.reduce((s, r) => s + (r.monthly_fee_kobo ?? 0), 0))} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase text-gray-500"><tr><th className="p-3">Vendor</th><th className="p-3">Calls</th><th className="p-3">Tokens</th><th className="p-3">AI cost</th><th className="p-3">Monthly fee</th><th className="p-3">AI share of fee</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const costKobo = Math.round(r.cost * rate * 100);
              const share = r.monthly_fee_kobo ? Math.round((costKobo / r.monthly_fee_kobo) * 100) : null;
              return (
                <tr key={r.id}>
                  <td className="p-3 font-medium">{r.name}</td><td className="p-3">{r.calls}</td><td className="p-3">{r.tokens.toLocaleString()}</td>
                  <td className="p-3">${r.cost.toFixed(3)} <span className="text-gray-500">({formatNaira(costKobo)})</span></td>
                  <td className="p-3">{formatNaira(r.monthly_fee_kobo)}</td>
                  <td className={`p-3 ${share !== null && share > 30 ? "font-medium text-red-600" : ""}`}>{share === null ? "-" : `${share}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
