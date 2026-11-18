import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPilotPersonId } from "@/lib/session";

export const dynamic = "force-dynamic";

const hours = z.number().min(0).max(100_000);
const schema = z.object({
  totalHours: hours.refine((v) => v > 0, "must be more than 0"),
  picHours: hours.optional(),
  nightHours: hours.optional(),
  instrumentHours: hours.optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * PUT — the pilot sets their brought-forward opening balance (the hours before their first logged flight), e.g. from
 * the "brought forward" line Lumi read off a paper logbook page, after checking it. Always self-declared; only ever set
 * by an explicit pilot action, never automatically.
 */
export async function PUT(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });

  const d = parsed.data;
  const asOf = new Date(`${d.asOf}T00:00:00Z`);
  if (asOf.getTime() > Date.now() + 86_400_000) return NextResponse.json({ error: "validation_failed", issues: [{ path: "asOf", message: "can't be in the future" }] }, { status: 422 });
  const data = { totalHours: d.totalHours, picHours: d.picHours ?? null, nightHours: d.nightHours ?? null, instrumentHours: d.instrumentHours ?? null, asOf, selfDeclared: true };
  await db.logbookSummary.upsert({ where: { personId }, update: data, create: { personId, ...data } });
  return NextResponse.json({ ok: true });
}
