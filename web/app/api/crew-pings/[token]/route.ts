import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { advanceCascade, respondToPing, type RespondError } from "@/lib/cascade";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const STATUS: Record<RespondError, number> = { not_found: 404, not_pending: 409, expired: 410, already_filled: 409, no_longer_available: 409 };
const schema = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) });

type Ctx = { params: Promise<{ token: string }> };

/** GET — what a pilot sees when they open the link from WhatsApp. The unguessable token is the credential. */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (isRateLimited(`ping-get:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const ping = await db.crewPing.findUnique({
    where: { token: (await params).token },
    include: { crewRequest: { include: { operator: { select: { name: true } } } }, person: { select: { fullName: true } } },
  });
  if (!ping) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Mark overdue pings as expired so the page never offers a button that cannot work.
  const expired = ping.status === "PENDING" && ping.expiresAt.getTime() <= Date.now();
  if (expired) await advanceCascade(ping.crewRequestId);
  const r = ping.crewRequest;
  return NextResponse.json({
    status: expired ? "EXPIRED" : ping.status,
    secondsLeft: ping.status === "PENDING" && !expired ? Math.round((ping.expiresAt.getTime() - Date.now()) / 1000) : 0,
    pilotName: ping.person.fullName,
    operatorName: r.operator.name,
    role: r.role,
    types: r.requiredRatings,
    departureIcao: r.departureIcao,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    hoursRequired: r.hoursRequired,
    requestStatus: r.status,
  });
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
