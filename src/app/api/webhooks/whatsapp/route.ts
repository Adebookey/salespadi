import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyHmac } from "@/lib/crypto";
import { acceptWebhook } from "@/lib/webhooks";

// Meta calls this once with a challenge when you save the webhook URL in the app dashboard.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env.metaVerifyToken) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyHmac("sha256", env.metaAppSecret, raw, req.headers.get("x-hub-signature-256"), "sha256=")) {
    return new Response("Invalid signature", { status: 401 });
  }
  await acceptWebhook("whatsapp", raw, "inbound.whatsapp");
  return NextResponse.json({ ok: true });
}
