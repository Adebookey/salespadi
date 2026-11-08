import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Empty, PageHeader, timeAgo } from "@/components/ui";

export default async function Escalations() {
  const { supabase } = await requireOperator();
  const { data } = await supabase.from("conversations")
    .select("id, vendor_id, channel_type, handoff_reason, last_message_at, status, customer:customers(name, phone), vendor:vendors(name)")
    .eq("needs_attention", true).order("last_message_at", { ascending: true });
  const rows = (data ?? []) as unknown as {
    id: string; vendor_id: string; channel_type: string; handoff_reason: string | null; last_message_at: string; status: string;
    customer: { name: string | null; phone: string | null }; vendor: { name: string };
  }[];
  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="Escalation queue" description="Chats across all vendors waiting for a person, oldest first." />
      {rows.length === 0 ? <Empty title="Nothing waiting 🎉" /> : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/v/${r.vendor_id}/inbox/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-gray-50">
                <div>
                  <div className="font-medium">{r.vendor.name} · {r.customer.name ?? r.customer.phone ?? "Customer"}</div>
                  <div className="text-sm text-amber-700">{r.handoff_reason ?? "New message while a person is handling the chat"}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Badge colour={r.channel_type === "whatsapp" ? "green" : "purple"}>{r.channel_type}</Badge>{timeAgo(r.last_message_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
