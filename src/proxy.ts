import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, images and webhooks (webhooks authenticate with signatures, not cookies).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/worker|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
