import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { flightColumns, flightSchema } from "@/lib/logbook-input";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownEntry(id: string) {
  const personId = await getPilotPersonId();
  if (!personId) return { personId: null as string | null, entry: null };
  const entry = await db.flightLogEntry.findFirst({ where: { id, personId }, select: { id: true, source: true } });
  return { personId, entry };
}

/** PATCH — edit a flight. Platform (auto-logged) flights are editable too, so a pilot can fix the PIC/night split. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { personId, entry } = await ownEntry(id);
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = flightSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  await db.flightLogEntry.update({ where: { id }, data: flightColumns(parsed.data) });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a flight. Platform flights can't be deleted (they'd just re-sync); edit them instead. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { personId, entry } = await ownEntry(id);
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (entry.source === "PLATFORM") {
    return NextResponse.json({ error: "cannot_delete", message: "Flights flown through Lumiritin can't be deleted — edit the details instead." }, { status: 400 });
  }
  await db.flightLogEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
