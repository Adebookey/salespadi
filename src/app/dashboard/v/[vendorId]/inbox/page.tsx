import Link from "next/link";
import { getVendorForUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, Empty, PageHeader, cn, timeAgo } from "@/components/ui";
import type { Conversation, Customer } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs a person" },
  { id: "human", label: "Handled by team" },
  { id: "ai", label: "AI" },
];

export default async function InboxPage({ params, searchParams }: { params: Promise<{ vendorId: string }>; searchParams: Promise<{ f?: string }> }) {
  const { vendorId } = await params;
  const f = (await searchParams).f ?? "all";
  const { supabase } = await getVendorForUser(vendorId);
  let q = supabase.from("conversations").select("*, customer:customers(*)").eq("vendor_id", vendorId)
    .neq("status", "closed").order("last_message_at", { ascending: false }).limit(100);
  if (f === "attention") q = q.eq("needs_attention", true);
  if (f === "human" || f === "ai") q = q.eq("status", f);
  const { data } = await q;
  const convs = (data ?? []) as (Conversation & { customer: Customer })[];

  const ids = convs.map((c) => c.id);
  const { data: lastMessages } = ids.length
    ? await supabase.from("messages").select("conversation_id, content, direction, type, created_at")
        .in("conversation_id", ids).order("created_at", { ascending: false }).limit(400)
    : { data: [] };
  const last = new Map<string, { content: string; direction: string; type: string }>();
  for (const m of lastMessages ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader title="Inbox" description="WhatsApp and Instagram in one place." />
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((x) => (
          <Link key={x.id} href={`?f=${x.id}`} className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm", f === x.id ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200")}>{x.label}</Link>
        ))}
      </div>
      {convs.length === 0 ? <Empty title="No conversations here" /> : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
          {convs.map((c) => {
            const m = last.get(c.id);
            return (
              <li key={c.id}>
                <Link href={`/dashboard/v/${vendorId}/inbox/${c.id}`} className="flex gap-3 p-3 hover:bg-gray-50">
                  <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", c.channel_type === "whatsapp" ? "bg-green-600" : "bg-pink-600")}>
                    {c.channel_type === "whatsapp" ? "WA" : "IG"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.customer.name ?? c.customer.phone ?? "Customer"}</span>
                      <span className="shrink-0 text-xs text-gray-500">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="truncate text-sm text-gray-600">
                      {m ? `${m.direction === "out" ? "You: " : ""}${m.type === "image" && !m.content ? "📷 Photo" : m.type === "audio" ? "🎤 Voice note" : m.content}` : ""}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {c.needs_attention && <Badge colour="amber">Needs a person</Badge>}
                      {c.status === "human" && <Badge colour="blue">Team</Badge>}
                      {c.handoff_reason && c.needs_attention && <span className="truncate text-xs text-amber-700">{c.handoff_reason}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
