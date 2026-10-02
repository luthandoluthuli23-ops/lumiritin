import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPilotPersonId } from "@/lib/session";

const schema = z.object({ id: z.string().min(1), action: z.enum(["accept", "decline", "leave"]) });

/** POST — a pilot accepts or declines an operator's roster invitation, or leaves a roster they are on. */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  const { id, action } = parsed.data;

  const entry = await db.crewRoster.findFirst({ where: { id, personId } });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "accept") {
    await db.crewRoster.update({ where: { id }, data: { status: "ACTIVE" } });
  } else {
    // Leaving also lifts any block that operator placed on this pilot's calendar.
    await db.$transaction([
      db.availability.deleteMany({ where: { personId, source: "OPERATOR", operatorId: entry.operatorId } }),
      db.crewRoster.delete({ where: { id } }),
    ]);
  }
  return NextResponse.json({ ok: true });
}
