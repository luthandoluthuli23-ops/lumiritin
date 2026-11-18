import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { respondToPing, type RespondError } from "@/lib/cascade";
import { loadPingView } from "@/lib/crew-ping-view";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const STATUS: Record<RespondError, number> = { not_found: 404, not_pending: 409, expired: 410, already_filled: 409, no_longer_available: 409 };
const schema = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) });

type Ctx = { params: Promise<{ token: string }> };

/** GET — what a pilot sees when they open the link from WhatsApp. The unguessable token is the credential. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (isRateLimited(`ping-get:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const view = await loadPingView((await params).token);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}

/** POST { decision } — accept or decline. Accepting locks the pilot as BOOKED for the job window. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (isRateLimited(`ping-post:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  const result = await respondToPing((await params).token, parsed.data.decision);
  if (!result.ok) return NextResponse.json({ error: result.error, status: result.status }, { status: STATUS[result.error] });
  return NextResponse.json({ ok: true, decision: result.decision });
}
