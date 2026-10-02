import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOperatorContext } from "@/lib/session";

const schema = z
  .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), note: z.string().trim().max(120).optional() })
  .superRefine((v, ctx) => {
    if (v.endsAt.getTime() <= Date.now()) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "must be in the future" });
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "must be after the start" });
    if (v.endsAt.getTime() - v.startsAt.getTime() > 31 * 86_400_000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "at most 31 days at a time" });
  });

type Ctx = { params: Promise<{ id: string }> };

async function activeOwnEntry(id: string) {
  const operator = await getOperatorContext();
  if (!operator) return { operator: null, entry: null };
  const entry = await db.crewRoster.findFirst({ where: { id, operatorId: operator.operatorId, status: "ACTIVE" } });
  return { operator, entry };
}

/**
 * POST — dispatcher control: mark a rostered pilot BOOKED for an internal flight that is not in the app, so they
 * are not offered other jobs then. Only works for ACTIVE roster pilots (the pilot consented to the roster).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { operator, entry } = await activeOwnEntry((await params).id);
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });

  const w = await db.availability.create({
    data: { personId: entry.personId, state: "BOOKED", source: "OPERATOR", operatorId: operator.operatorId, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, note: parsed.data.note || "Operator flight" },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, windowId: w.id }, { status: 201 });
}

/** DELETE ?windowId= — release a block this operator created. Other sources (jobs, calendar) cannot be released here. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { operator, entry } = await activeOwnEntry((await params).id);
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const windowId = req.nextUrl.searchParams.get("windowId") ?? "";
  const { count } = await db.availability.deleteMany({ where: { id: windowId, personId: entry.personId, source: "OPERATOR", operatorId: operator.operatorId } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
