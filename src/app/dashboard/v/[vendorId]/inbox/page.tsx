import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { ChannelDot } from "@/components/channel-dot";
import { getVendorForUser } from "@/lib/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Badge, Empty, FilterChips, List, PageHeader, cn, timeAgo } from "@/components/ui";
import type { Conversation, Customer } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs a person" },
  { id: "human", label: "Team replying" },
  { id: "ai", label: "AI replying" },
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
      <PageHeader title="Inbox" description="WhatsApp and Instagram chats in one place." />
      <FilterChips active={f} items={FILTERS.map((x) => ({ ...x, href: `?f=${x.id}` }))} />
      {convs.length === 0 ? <Empty icon={<MessageCircle />} title="No conversations here">New chats appear as customers message the shop.</Empty> : (
        <List>
          {convs.map((c) => {
            const m = last.get(c.id);
            const name = c.customer.name ?? c.customer.phone ?? "Customer";
            const preview = m ? `${m.direction === "out" ? "You: " : ""}${m.type === "image" && !m.content ? "📷 Photo" : m.type === "audio" ? "🎤 Voice note" : m.content}` : "";
            return (
              <li key={c.id}>
                <Link href={`/dashboard/v/${vendorId}/inbox/${c.id}`} className="flex gap-3 px-4 py-3.5 transition hover:bg-surface-2">
                  <span className="relative">
                    <Avatar name={name.replace(/^@/, "")} className="size-11" />
                    <ChannelDot type={c.channel_type} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-[15px] text-fg", c.needs_attention ? "font-semibold" : "font-medium")}>{name}</span>
                      <span className={cn("shrink-0 text-xs", c.needs_attention ? "font-medium text-amber-600 dark:text-amber-400" : "text-subtle")}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className={cn("mt-0.5 line-clamp-1 text-sm", c.needs_attention ? "text-fg" : "text-muted")}>{preview}</div>
                    {(c.needs_attention || c.status === "human") && (
                      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                        {c.needs_attention && <Badge colour="amber">Needs a person</Badge>}
                        {c.status === "human" && !c.needs_attention && <Badge colour="blue">Team replying</Badge>}
                        {c.handoff_reason && c.needs_attention && <span className="truncate text-xs text-subtle">{c.handoff_reason}</span>}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </List>
      )}
    </>
  );
}
