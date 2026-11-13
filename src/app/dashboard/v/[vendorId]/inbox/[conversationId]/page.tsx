import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Check, CheckCheck, ChevronLeft, ChevronRight, Hand, Phone, X } from "lucide-react";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChannelDot } from "@/components/channel-dot";
import { Avatar, Button, Card, CardHeader, Notice, OrderStatusBadge, cn } from "@/components/ui";
import { windowOpen } from "@/lib/services/messaging";
import { formatNaira } from "@/lib/money";
import type { Conversation, Customer, Message, Order } from "@/lib/types";
import { markResolved, sendHumanReply, setConversationStatus } from "../../../../_actions/inbox";
import { ReplyComposer } from "./reply-composer";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });

export default async function ConversationPage({ params }: { params: Promise<{ vendorId: string; conversationId: string }> }) {
  const { vendorId, conversationId } = await params;
  const { supabase } = await getVendorForUser(vendorId);
  const { data } = await supabase.from("conversations").select("*, customer:customers(*)").eq("id", conversationId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) notFound();
  const conv = data as Conversation & { customer: Customer };
  const [{ data: msgs }, { data: orders }] = await Promise.all([
    supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(150),
    supabase.from("orders").select("*").eq("customer_id", conv.customer_id).order("created_at", { ascending: false }).limit(10),
  ]);
  const messages = ((msgs ?? []) as Message[]).reverse();

  // Customer media is private: sign short-lived URLs for display.
  const paths = messages.filter((m) => m.media_url && m.direction === "in").map((m) => m.media_url!);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await adminClient().storage.from("chat-media").createSignedUrls(paths, 3600);
    urls?.forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }
  const open = windowOpen(conv.last_inbound_at);
  const act = setConversationStatus.bind(null, vendorId, conversationId);
  const name = conv.customer.name ?? conv.customer.phone ?? "Customer";
  const base = `/dashboard/v/${vendorId}`;

  const details = (
    <>
      <Card>
        <CardHeader title="Customer" />
        <dl className="space-y-2.5 text-sm">
          {[["Name", conv.customer.name], ["Phone", conv.customer.phone], ["Address", conv.customer.address], ["Promos", conv.customer.opted_in_broadcast ? "Opted in" : "Not opted in"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-subtle">{k}</dt><dd className="text-right text-fg">{v || "-"}</dd></div>
          ))}
        </dl>
        {conv.customer.phone && (
          <a href={`tel:+${conv.customer.phone.replace(/\D/g, "")}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2">
            <Phone className="size-4" /> Call customer
          </a>
        )}
      </Card>
      <Card className="p-0 sm:p-0">
        <h2 className="px-4 pb-1 pt-4 text-[15px] font-semibold text-fg sm:px-5">Orders</h2>
        <ul className="divide-y divide-line">
          {((orders ?? []) as Order[]).map((o) => (
            <li key={o.id}>
              <Link href={`${base}/orders/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2 sm:px-5">
                <span className="tabular text-fg">#{o.number} · {formatNaira(o.total_kobo)}</span><OrderStatusBadge status={o.status} />
              </Link>
            </li>
          ))}
          {!orders?.length && <li className="px-4 pb-4 text-sm text-muted sm:px-5">No orders yet.</li>}
        </ul>
      </Card>
      {conv.summary && (
        <Card><CardHeader title="AI notes" /><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{conv.summary}</p></Card>
      )}
    </>
  );

  // Show a date divider wherever the day changes.
  const dayLabels = messages.map((m, i) => {
    const d = day(m.created_at);
    return i === 0 || d !== day(messages[i - 1].created_at) ? d : null;
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <AutoRefresh seconds={8} />
      <div className="-mx-4 flex flex-col sm:mx-0 sm:overflow-hidden sm:rounded-xl sm:border sm:border-line sm:shadow-card">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-y border-line bg-surface px-3 py-2.5 sm:border-t-0 sm:px-4">
          <Link href={`${base}/inbox`} className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Back to inbox">
            <ChevronLeft className="size-5" />
          </Link>
          <span className="relative"><Avatar name={name.replace(/^@/, "")} className="size-10" /><ChannelDot type={conv.channel_type} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-fg">{name}</div>
            <div className="flex items-center gap-1.5 text-xs text-subtle">
              {conv.status === "ai" ? <><Bot className="size-3.5" /> AI is replying</> : conv.status === "human" ? <><Hand className="size-3.5" /> Team is replying</> : "Closed"}
            </div>
          </div>
          <form action={act.bind(null, "closed")}>
            <button className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Close conversation" title="Close conversation"><X className="size-5" /></button>
          </form>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
          {conv.needs_attention && conv.handoff_reason && (
            <Notice tone="warn" className="w-full py-2">{conv.handoff_reason}</Notice>
          )}
          {conv.status === "ai"
            ? <form action={act.bind(null, "human")} className="flex-1 sm:flex-none"><Button size="sm" variant="secondary" className="w-full"><Hand className="size-4" /> Take over</Button></form>
            : <form action={act.bind(null, "ai")} className="flex-1 sm:flex-none"><Button size="sm" className="w-full"><Bot className="size-4" /> Hand back to AI</Button></form>}
          {conv.needs_attention && (
            <form action={markResolved.bind(null, vendorId, conversationId)} className="flex-1 sm:flex-none"><Button size="sm" variant="secondary" className="w-full"><Check className="size-4" /> Mark handled</Button></form>
          )}
        </div>

        {/* Customer details on phones */}
        <details className="group border-b border-line bg-surface lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg">
            Customer & orders <ChevronRight className="size-4 text-subtle transition group-open:rotate-90" />
          </summary>
          <div className="space-y-4 bg-canvas p-4">{details}</div>
        </details>

        {/* Messages */}
        <div className="flex min-h-[50vh] flex-1 flex-col gap-1.5 bg-chat px-3 py-4 sm:px-5">
          {messages.map((m, i) => {
            const d = dayLabels[i];
            const out = m.direction === "out";
            return (
              <div key={m.id} className="contents">
                {d && <div className="my-2 self-center rounded-md bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted shadow-card">{d}</div>}
                <div className={cn("max-w-[85%] rounded-2xl px-3 pb-1.5 pt-2 text-[15px] leading-snug text-fg shadow-card sm:max-w-[70%] sm:text-sm",
                  out ? "self-end rounded-br-md" : "self-start rounded-bl-md bg-bubble-in",
                  out && (m.sender === "human" ? "bg-bubble-team" : "bg-bubble-out"))}>
                  {m.media_url && m.type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.direction === "in" ? signed.get(m.media_url) : m.media_url} alt="" className="-mx-1 mb-1.5 max-h-64 w-[calc(100%+0.5rem)] rounded-xl object-cover" />
                  )}
                  {m.media_url && m.type === "audio" && m.direction === "in" && signed.get(m.media_url) && <audio controls src={signed.get(m.media_url)} className="mb-1 w-56 max-w-full" />}
                  {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-subtle">
                    {out && <span className="mr-auto pr-3 font-medium">{m.sender === "ai" ? "AI" : m.sender === "human" ? "Team" : "Auto"}</span>}
                    <span>{time(m.created_at)}</span>
                    {out && m.status === "read" && <CheckCheck className="size-3.5 text-sky-500" />}
                    {out && m.status === "delivered" && <CheckCheck className="size-3.5" />}
                    {out && m.status === "sent" && <Check className="size-3.5" />}
                  </div>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <p className="m-auto text-sm text-muted">No messages yet.</p>}
        </div>

        {/* Composer: sits above the phone's bottom tab bar */}
        <div className="sticky bottom-16 z-10 border-t border-line bg-surface/95 px-3 py-2.5 backdrop-blur-xl sm:px-4 md:bottom-0">
          <ReplyComposer action={sendHumanReply.bind(null, vendorId, conversationId)}
            placeholder={conv.status === "ai" ? "Reply (takes over from the AI)…" : "Type a reply…"}
            windowClosed={!open} whatsapp={conv.channel_type === "whatsapp"} />
        </div>
      </div>
      <div className="hidden space-y-5 lg:block">{details}</div>
    </div>
  );
}
