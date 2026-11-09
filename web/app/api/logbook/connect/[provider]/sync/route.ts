import { NextResponse, type NextRequest } from "next/server";
import { syncMyFlightbook, type SyncErrorCode } from "@/lib/logbook-sync";
import { isProvider } from "@/lib/logbook-connect";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS: Record<SyncErrorCode, number> = {
  not_connected: 409,
  reauth_required: 409,
  not_configured: 503,
  fetch_failed: 502,
  save_failed: 502,
};

/**
 * POST — "Sync now": pull the signed-in pilot's flights from the provider again. Safe to repeat: flights are matched on the
 * provider's own flight id, so this creates what is new, updates what changed and removes what was deleted over there.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isProvider(provider)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (isRateLimited(`logbook:sync:${provider}:${personId}`, process.env.NODE_ENV === "production" ? 6 : 500, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "You've synced a few times already. Please wait a few minutes and try again." }, { status: 429 });
  }

  const result = await syncMyFlightbook(personId);
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: STATUS[result.error] });
  return NextResponse.json(result);
}
