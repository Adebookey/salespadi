// Processes queued jobs. Called every minute by Supabase pg_cron (see supabase/cron.sql) or Vercel Cron,
// and right after each webhook. Protected by CRON_SECRET.
import { NextResponse } from "next/server";
import { runJobs } from "@/lib/jobs";
import { jobHandlers } from "@/lib/services/handlers";
import { isAuthorizedCron } from "@/lib/webhooks";

export const maxDuration = 300;

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const processed = await runJobs(jobHandlers(), 10, 20);
  return NextResponse.json({ processed });
}

export const GET = handle;
export const POST = handle;
