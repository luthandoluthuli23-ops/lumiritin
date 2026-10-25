import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PROFICIENCY_CODES } from "@/lib/proficiencies";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ proficiencies: z.array(z.enum(PROFICIENCY_CODES)).max(30) });

/** PATCH — the signed-in pilot sets their own list of proficiencies. */
export async function PATCH(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  const unique = [...new Set(parsed.data.proficiencies)];
  await db.person.update({ where: { id: personId }, data: { proficiencies: unique } });
  return NextResponse.json({ ok: true, proficiencies: unique });
}
