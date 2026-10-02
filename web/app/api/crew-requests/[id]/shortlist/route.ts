import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rankForRequest } from "@/lib/cascade";
import { EXCLUSION_LABEL, type ExclusionCode } from "@/lib/matching";
import { getOperatorContext } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET — the ranked top-3 shortlist for one of the signed-in operator's requests, with the full score breakdown.
 * Excluded pilots are only summarised by reason; their identities are not revealed.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await db.crewRequest.findFirst({ where: { id: (await params).id, operatorId: operator.operatorId } });
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await rankForRequest(request);
  return NextResponse.json({
    request: { id: request.id, status: request.status, dispatched: Boolean(request.dispatchedAt), startsAt: request.startsAt, endsAt: request.endsAt },
    shortlist: result.shortlist,
    eligibleCount: result.ranked.length,
    benchCount: Math.max(0, result.ranked.length - result.shortlist.length),
    excludedCount: result.excluded.length,
    excludedByReason: Object.entries(result.exclusionSummary).map(([code, count]) => ({ code, label: EXCLUSION_LABEL[code as ExclusionCode], count })),
  });
}
