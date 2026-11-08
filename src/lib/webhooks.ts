// Shared webhook plumbing: store the raw event, enqueue a job, kick the worker after responding.
import "server-only";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { adminClient } from "./supabase/admin";
import { enqueue, runJobs } from "./jobs";
import { jobHandlers } from "./services/handlers";

export async function acceptWebhook(source: "whatsapp" | "instagram" | "paystack", rawBody: string, jobType: string) {
  const db = adminClient();
  const externalId = createHash("sha256").update(rawBody).digest("hex");
  const { data, error } = await db.from("webhook_events")
    .insert({ source, external_id: externalId, payload: JSON.parse(rawBody) })
    .select("id").single();
  if (error?.code === "23505") return; // exact duplicate delivery
  if (error || !data) throw new Error(`store webhook: ${error?.message}`);
  await enqueue(jobType, { eventId: data.id });
  // Respond to Meta/Paystack immediately; process right after the response is sent.
  after(() => runJobs(jobHandlers(), 10, 3).catch((e) => console.error("[after runJobs]", e)));
}

export function isAuthorizedCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
