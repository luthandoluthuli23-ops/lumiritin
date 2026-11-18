import { NextResponse, type NextRequest } from "next/server";
import { runExpiryReminders } from "@/lib/reminders";
import { runStateNotifications } from "@/lib/state-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily expiry-reminder run, triggered by Vercel Cron (see vercel.json). Vercel sends the request
 * with `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set, so we require that to match —
 * and refuse to run at all until CRON_SECRET is configured, so this can't be hit anonymously.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured", message: "Set CRON_SECRET in the environment." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await runExpiryReminders();
  console.log(`[cron] expiry reminders: checked ${result.checked}, sent ${result.sent}, skipped ${result.skipped}`, result.byChannel);
  // State changes that happen just because time passed (EXPIRING, CHECK_OVERDUE) are announced here too.
  const states = await runStateNotifications();
  console.log("[cron] verification state messages:", states);
  return NextResponse.json({ ok: true, ...result, stateMessages: states });
}
