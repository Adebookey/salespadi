import { getVendorForUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea, lagosDateTime } from "@/components/ui";
import { weeklyReportText } from "@/lib/services/reports";
import { adminClient } from "@/lib/supabase/admin";
import { addCommentTrigger, createBroadcast, deleteCommentTrigger, sendWeeklyReportNow, setFollowups } from "../../../_actions/growth";

export default async function GrowthPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { supabase, vendor } = await getVendorForUser(vendorId);
  const [{ data: triggers }, { data: broadcasts }, { data: settings }, { count: optedIn }, report] = await Promise.all([
    supabase.from("comment_triggers").select("*").eq("vendor_id", vendorId).order("created_at"),
    supabase.from("broadcasts").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(10),
    supabase.from("vendor_settings").select("followup_enabled").eq("vendor_id", vendorId).single(),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId).eq("opted_in_broadcast", true),
    weeklyReportText(adminClient(), vendor),
  ]);

  return (
    <>
      <PageHeader title="Growth" description="Turn comments, enquiries and past buyers into sales." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-medium">Instagram comment-to-DM</h2>
          <p className="mt-1 text-sm text-muted">When someone comments the keyword on a post, they get this DM automatically and the AI takes it from there.</p>
          <ul className="my-3 space-y-2">
            {(triggers ?? []).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2 p-2 text-sm">
                <div><Badge colour="purple">{t.keyword}</Badge> <span className="text-muted">{t.reply_text}</span>{t.media_id && <div className="text-xs text-subtle">Only post {t.media_id}</div>}</div>
                <form action={deleteCommentTrigger.bind(null, vendorId, t.id)}><Button variant="ghost" className="text-red-600 dark:text-red-400">Remove</Button></form>
              </li>
            ))}
          </ul>
          <ActionForm action={addCommentTrigger.bind(null, vendorId)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Keyword"><Input name="keyword" placeholder="PRICE" /></Field>
              <Field label="Post ID (optional)"><Input name="media_id" placeholder="Any post" /></Field>
            </div>
            <Field label="DM to send"><Textarea name="reply_text" rows={2} placeholder="Hi! Thanks for your interest 😊 It's ₦28,000. Which size do you wear?" /></Field>
            <SubmitButton variant="secondary">Add trigger</SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="font-medium">Broadcast to past customers</h2>
          <p className="mt-1 text-sm text-muted">{optedIn ?? 0} customer(s) opted in. Customers who messaged in the last 24h get it as a normal message; on WhatsApp, others need an approved template.</p>
          <ActionForm action={createBroadcast.bind(null, vendorId)} className="mt-3 space-y-3">
            <Field label="Message"><Textarea name="message" rows={3} placeholder="New stock just landed! 🔥 Size 40-45 available. Reply to order." /></Field>
            <Field label="WhatsApp template name (optional)" hint="An approved marketing template with one body variable, used outside the 24h window."><Input name="template_name" /></Field>
            <SubmitButton>Send broadcast</SubmitButton>
          </ActionForm>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {(broadcasts ?? []).map((b) => <li key={b.id}>{lagosDateTime(b.created_at)} · {b.status} · {b.sent_count} sent · <span className="text-subtle">{b.message.slice(0, 50)}</span></li>)}
          </ul>
        </Card>

        <Card>
          <h2 className="font-medium">Follow-ups</h2>
          <p className="mt-1 text-sm text-muted">About 20 hours after someone asks but doesn&apos;t order, the assistant sends one friendly check-in (inside WhatsApp&apos;s 24-hour window). At most once a week per customer.</p>
          <form action={setFollowups.bind(null, vendorId, !settings?.followup_enabled)} className="mt-3">
            <Button variant={settings?.followup_enabled ? "secondary" : "primary"}>{settings?.followup_enabled ? "Turn off follow-ups" : "Turn on follow-ups"}</Button>
          </form>
          <p className="mt-4 text-sm text-muted">Also automatic: payment reminders for unpaid orders (2h and 20h), restock alerts to customers who asked for a sold-out item, and a feedback request after delivery.</p>
        </Card>

        <Card>
          <h2 className="font-medium">Weekly report</h2>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-sm">{report}</pre>
          <p className="mt-2 text-xs text-subtle">Sent to the owner&apos;s WhatsApp every Monday morning.</p>
          <ActionForm action={sendWeeklyReportNow.bind(null, vendorId)} className="mt-3">
            <SubmitButton variant="secondary" pendingText="Sending…">Send now</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
