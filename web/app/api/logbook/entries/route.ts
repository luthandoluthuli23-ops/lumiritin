import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { flightColumns, flightSchema } from "@/lib/logbook-input";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFuture = (d: Date) => d.getTime() <= Date.now() + 86_400_000;
// Accept either a single flight, or a batch (e.g. the rows a scan filled in, confirmed by the pilot).
const bulkSchema = z.object({ flights: z.array(flightSchema).min(1).max(100) });

/** POST — the signed-in pilot adds one off-platform flight by hand, or saves a reviewed batch of scanned flights. */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = await req.json().catch(() => null);

  // ── Batch: { flights: [...] } — used by scan-to-fill after the pilot reviews the rows ──
  const batch = bulkSchema.safeParse(raw);
  if (batch.success) {
    const flights = batch.data.flights.filter((d) => notFuture(d.date));
    if (flights.length === 0) return NextResponse.json({ error: "validation_failed", message: "No valid flights to save." }, { status: 422 });
    await db.flightLogEntry.createMany({
      data: flights.map((d) => ({ personId, source: "MANUAL" as const, verified: false, ...flightColumns(d) })),
    });
    return NextResponse.json({ saved: flights.length }, { status: 201 });
  }

  // ── Single flight ──
  const parsed = flightSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const d = parsed.data;
  if (!notFuture(d.date)) {
    return NextResponse.json({ error: "validation_failed", issues: [{ path: "date", message: "can't be in the future" }] }, { status: 422 });
  }

  const created = await db.flightLogEntry.create({
    data: { personId, source: "MANUAL", verified: false, ...flightColumns(d) },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
