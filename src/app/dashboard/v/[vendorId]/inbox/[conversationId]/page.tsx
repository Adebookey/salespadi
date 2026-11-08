import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Checkbox, Notice, OrderStatusBadge, Textarea, cn, lagosDateTime } from "@/components/ui";
import { windowOpen } from "@/lib/services/messaging";
import { formatNaira } from "@/lib/money";
import type { Conversation, Customer, Message, Order } from "@/lib/types";
import { markResolved, sendHumanReply, setConversationStatus } from "../../../../_actions/inbox";

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
  const paths = messages.filter((m) => m.media_url && m.direction === "in").map((m) => m.media_url!) ;
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await adminClient().storage.from("chat-media").createSignedUrls(paths, 3600);
    urls?.forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }
  const open = windowOpen(conv.last_inbound_at);
  const act = setConversationStatus.bind(null, vendorId, conversationId);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <AutoRefresh seconds={8} />
      <Card className="flex min-h-[70vh] flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-3">
          <div>
            <Link href={`/dashboard/v/${vendorId}/inbox`} className="text-xs text-gray-500">← Inbox</Link>
            <div className="font-medium">{conv.customer.name ?? conv.customer.phone ?? "Customer"} <span className="text-xs text-gray-500">via {conv.channel_type === "whatsapp" ? "WhatsApp" : "Instagram"}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {conv.status === "ai"
              ? <form action={act.bind(null, "human")}><Button variant="secondary">Take over</Button></form>
              : <form action={act.bind(null, "ai")}><Button>Hand back to AI</Button></form>}
            {conv.needs_attention && <form action={markResolved.bind(null, vendorId, conversationId)}><Button variant="secondary">Mark handled</Button></form>}
            <form action={act.bind(null, "closed")}><Button variant="ghost">Close</Button></form>
          </div>
        </div>
        {conv.needs_attention && conv.handoff_reason && <div className="px-3 pt-3"><Notice tone="warn">AI handed off: {conv.handoff_reason}</Notice></div>}
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] p-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm", m.direction === "in" ? "self-start bg-white" : m.sender === "human" ? "self-end bg-blue-100" : "self-end bg-[#d9fdd3]")}>
              {m.media_url && m.type === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.direction === "in" ? signed.get(m.media_url) : m.media_url} alt="" className="mb-1 max-h-60 rounded" />
              )}
              {m.media_url && m.type === "audio" && m.direction === "in" && signed.get(m.media_url) && <audio controls src={signed.get(m.media_url)} className="mb-1 w-56" />}
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              <div className="mt-1 flex justify-end gap-1 text-[10px] text-gray-500">
                {m.direction === "out" && <span>{m.sender === "ai" ? "AI" : m.sender === "human" ? "Team" : "Auto"}</span>}
                <span>{lagosDateTime(m.created_at)}</span>
                {m.status && m.direction === "out" && <span>· {m.status}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 p-3">
          <ActionForm action={sendHumanReply.bind(null, vendorId, conversationId)} className="space-y-2">
            {!open && <p className="text-xs text-amber-700">Last customer message was over 24 hours ago: {conv.channel_type === "whatsapp" ? "only a template message can be sent." : "Instagram won't deliver a new message until they write again."}</p>}
            <Textarea name="text" rows={2} placeholder={conv.status === "ai" ? "Replying here takes over from the AI…" : "Type a reply…"} className="min-h-0" />
            <div className="flex items-center justify-between gap-2">
              {!open && conv.channel_type === "whatsapp" ? <Checkbox name="use_template" label="Send as template" defaultChecked /> : <span />}
              <SubmitButton pendingText="Sending…">Send</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <h2 className="font-medium">Customer</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div><dt className="inline text-gray-500">Name: </dt><dd className="inline">{conv.customer.name ?? "-"}</dd></div>
            <div><dt className="inline text-gray-500">Phone: </dt><dd className="inline">{conv.customer.phone ?? "-"}</dd></div>
            <div><dt className="inline text-gray-500">Address: </dt><dd className="inline">{conv.customer.address ?? "-"}</dd></div>
            <div><dt className="inline text-gray-500">Promos: </dt><dd className="inline">{conv.customer.opted_in_broadcast ? "Opted in" : "No"}</dd></div>
          </dl>
          <div className="mt-2"><Badge colour={conv.status === "ai" ? "green" : "blue"}>{conv.status === "ai" ? "AI replying" : conv.status === "human" ? "Team replying" : "Closed"}</Badge></div>
        </Card>
        <Card>
          <h2 className="font-medium">Orders</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {((orders ?? []) as Order[]).map((o) => (
              <li key={o.id}><Link href={`/dashboard/v/${vendorId}/orders/${o.id}`} className="flex items-center justify-between gap-2">
                <span>#{o.number} · {formatNaira(o.total_kobo)}</span><OrderStatusBadge status={o.status} />
              </Link></li>
            ))}
            {!orders?.length && <li className="text-gray-500">No orders yet.</li>}
          </ul>
        </Card>
        {conv.summary && <Card><h2 className="font-medium">AI notes</h2><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{conv.summary}</p></Card>}
      </div>
    </div>
  );
}
