import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { advanceCascade } from "@/lib/cascade";
import { getOperatorContext } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET — live dispatch status. Calling it also advances the cascade (expires overdue pings and pings the next
 * candidate), so the operator's open page keeps the cascade moving even if no scheduler is running.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = (await params).id;

  const owned = await db.crewRequest.findFirst({ where: { id, operatorId: operator.operatorId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await advanceCascade(id);

  const request = await db.crewRequest.findUniqueOrThrow({
    where: { id },
    include: { pings: { orderBy: { rank: "asc" }, include: { person: { select: { fullName: true } } } } },
  });
  const now = Date.now();
  return NextResponse.json({
    status: request.status,
    dispatched: Boolean(request.dispatchedAt),
    assignedPersonId: request.assignedPersonId,
    pings: request.pings.map((p) => ({
      rank: p.rank,
      personId: p.personId,
      name: p.person.fullName,
      status: p.status,
      secondsLeft: p.status === "PENDING" ? Math.max(0, Math.round((p.expiresAt.getTime() - now) / 1000)) : 0,
      whatsappSent: p.whatsappSent,
    })),
  });
}
