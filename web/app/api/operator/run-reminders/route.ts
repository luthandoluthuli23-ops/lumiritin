import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { runExpiryReminders } from "@/lib/reminders";
import { getOperatorContext } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual trigger for testing the expiry reminders now (operators only). Deduped, so repeat runs are safe. */
export async function POST() {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRateLimited(`run-reminders:${operator.operatorId}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Please wait a few minutes before running again." }, { status: 429 });
  }

  const r = await runExpiryReminders();
  return NextResponse.json({
    ok: true,
    ...r,
    message: `Checked ${r.checked} expiring item(s); sent ${r.sent} reminder(s) — ${r.byChannel.email} email, ${r.byChannel.whatsapp} WhatsApp. (Already-reminded items are skipped.)`,
  });
}
