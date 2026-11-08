// Monday morning: weekly report to every live vendor.
import { NextResponse } from "next/server";
import { enqueue } from "@/lib/jobs";
import { isAuthorizedCron } from "@/lib/webhooks";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  await enqueue("cron.weekly", {}, { dedupeKey: `once:cron.weekly:${new Date().toISOString().slice(0, 10)}` });
  return NextResponse.json({ ok: true });
}
