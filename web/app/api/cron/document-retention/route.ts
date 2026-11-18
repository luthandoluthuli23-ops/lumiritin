import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredDocuments } from "@/lib/pilot-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily retention run (Vercel Cron, see vercel.json): deletes verification document images 90 days after a decision.
 * The submission, its decision and the audit log are kept. Requires CRON_SECRET, like the reminders cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await purgeExpiredDocuments();
  console.log(`[cron] document retention: purged ${result.documents} document(s) from ${result.submissions} submission(s)`);
  return NextResponse.json({ ok: true, ...result });
}
