import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOperatorContext } from "@/lib/session";

const patchSchema = z.object({ sharedToPool: z.boolean() });

type Ctx = { params: Promise<{ id: string }> };

/** Only entries belonging to the signed-in operator are ever visible to these handlers. */
async function ownEntry(id: string) {
  const operator = await getOperatorContext();
  if (!operator) return { operator: null, entry: null };
  const entry = await db.crewRoster.findFirst({ where: { id, operatorId: operator.operatorId } });
  return { operator, entry };
}

/** PATCH — offer this rostered pilot to (or withdraw them from) the shared pool. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { operator, entry } = await ownEntry((await params).id);
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (entry.status !== "ACTIVE") return NextResponse.json({ error: "validation_failed", issues: [{ path: "id", message: "the pilot has not accepted the invitation yet" }] }, { status: 409 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  await db.crewRoster.update({ where: { id: entry.id }, data: { sharedToPool: parsed.data.sharedToPool } });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove the pilot from the roster (or withdraw a pending invitation). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { operator, entry } = await ownEntry((await params).id);
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.$transaction([
    db.availability.deleteMany({ where: { personId: entry.personId, source: "OPERATOR", operatorId: operator.operatorId } }),
    db.crewRoster.delete({ where: { id: entry.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
