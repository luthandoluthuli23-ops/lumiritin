import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { getOperatorContext } from "@/lib/session";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

/**
 * POST /api/operator/roster — invite a pilot to this operator's roster by account email.
 * The pilot must accept (in their wallet) before the operator can see or control their availability.
 * The response is the same whether or not a pilot account exists, so this cannot be used to probe for accounts.
 */
export async function POST(req: NextRequest) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRateLimited(`roster-invite:${operator.operatorId}`, 20, 60 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed", issues: [{ path: "email", message: "enter a valid email" }] }, { status: 422 });

  const pilot = await db.user.findUnique({ where: { email: parsed.data.email }, select: { role: true, personId: true } });
  if (pilot?.role === "PILOT" && pilot.personId) {
    await db.crewRoster.upsert({
      where: { operatorId_personId: { operatorId: operator.operatorId, personId: pilot.personId } },
      update: {},
      create: { operatorId: operator.operatorId, personId: pilot.personId },
    });
  }
  return NextResponse.json({ ok: true, message: "If a pilot account exists for that email, an invitation is now waiting for them." }, { status: 202 });
}
