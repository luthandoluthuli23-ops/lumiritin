import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { COMPETENCY_CODES } from "@/lib/competencies";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ competencies: z.array(z.enum(COMPETENCY_CODES)).max(30) });

/** PATCH — the signed-in pilot sets their own list of competencies. */
export async function PATCH(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  const unique = [...new Set(parsed.data.competencies)];
  await db.person.update({ where: { id: personId }, data: { competencies: unique } });
  return NextResponse.json({ ok: true, competencies: unique });
}
