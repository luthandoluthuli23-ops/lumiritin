import { NextResponse, type NextRequest } from "next/server";
import { dispatchRequest, PING_WINDOW_MS } from "@/lib/cascade";
import { isRateLimited } from "@/lib/rate-limit";
import { getOperatorContext } from "@/lib/session";

const STATUS: Record<string, number> = { not_found: 404, not_open: 409, already_dispatched: 409, no_candidates: 422, in_the_past: 422 };

/** POST — send the 10-minute confirm-ping to the top 3 shortlisted pilots. Can only be done once per request. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRateLimited(`dispatch:${operator.operatorId}`, 30, 60 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const result = await dispatchRequest((await params).id, operator.operatorId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ ...result, confirmWithinMinutes: PING_WINDOW_MS / 60_000 }, { status: 201 });
}
