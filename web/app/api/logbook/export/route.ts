import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildLogbookCsv } from "@/lib/logbook-export";
import { syncPlatformFlights } from "@/lib/logbook";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the signed-in pilot's whole logbook as a CSV download (every flight, every source, plus the opening balance). */
export async function GET() {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await syncPlatformFlights(personId); // include Lumiritin flights that have just ended
  const [entries, summary] = await Promise.all([
    db.flightLogEntry.findMany({ where: { personId }, orderBy: { date: "asc" } }),
    db.logbookSummary.findUnique({ where: { personId } }),
  ]);
  const csv = buildLogbookCsv(entries, summary);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lumiritin-logbook-${today}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
