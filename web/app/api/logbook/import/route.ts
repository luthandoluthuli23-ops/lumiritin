import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractFlightsFromDocument, extractFromDocument, isLumiConfigured, LUMI_ACCEPTED_MEDIA } from "@/lib/lumi";
import { lumiRowsToEntries, parseLogbookCsv, replaceImported } from "@/lib/logbook";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel rejects request bodies above ~4.5 MB before our code runs (with a non-JSON error), so cap below that.
const MAX_BYTES = 4 * 1024 * 1024;
const isCsv = (f: File) => /\.csv$/i.test(f.name) || /csv|excel|text\/plain/i.test(f.type);

/**
 * POST (multipart: `file`, optional `provider`, `ref`) — import the pilot's existing logbook in one shot.
 *   • CSV  → parsed exactly into one FlightLogEntry per flight (replaces any previous import).
 *   • PDF/image → Lumi reads the totals and sets the brought-forward opening balance.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Upload a file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file", message: "Upload a file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "too_large", message: "File must be between 1 byte and 4 MB." }, { status: 413 });

  const provider = String(form.get("provider") ?? "").trim().slice(0, 40) || null;
  const ref = String(form.get("ref") ?? "").trim().slice(0, 60) || null;
  // Remember which logbook this came from, but only once the import actually succeeded (a rejected file must not flip it).
  const rememberSource = async () => {
    if (provider || ref) {
      await db.person.update({ where: { id: personId }, data: { ...(provider ? { logbookProvider: provider } : {}), ...(ref ? { logbookRef: ref } : {}) } });
    }
  };

  // ── CSV: exact, free, one entry per flight ─────────────────────────────────
  if (isCsv(file)) {
    const text = await file.text();
    const result = parseLogbookCsv(text, personId);
    if (result.error) return NextResponse.json({ ok: false, message: result.error }, { status: 422 });
    if (result.rows.length === 0) return NextResponse.json({ ok: false, message: "No flights found in that file." }, { status: 422 });

    const { replaced } = await replaceImported(personId, result.rows);
    await rememberSource();
    return NextResponse.json({ ok: true, mode: "csv", imported: result.imported, skipped: result.skipped, replaced });
  }

  // ── PDF/image: Lumi reads the actual flights (falling back to totals) ───────
  if (!(LUMI_ACCEPTED_MEDIA as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "bad_type", message: "Upload a CSV export, or a PDF/photo of your logbook." }, { status: 415 });
  }
  if (!isLumiConfigured()) return NextResponse.json({ error: "not_configured", message: "Lumi isn't switched on yet. Import a CSV export instead." }, { status: 503 });
  if (isRateLimited(`lumi:import:${personId}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many imports. Please wait a few minutes." }, { status: 429 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  // First try to read individual flights — the real seamless transfer.
  const flightsResult = await extractFlightsFromDocument({ data, mediaType: file.type });
  if (flightsResult.ok && flightsResult.flights && flightsResult.flights.length > 0) {
    const rows = lumiRowsToEntries(flightsResult.flights, personId);
    const { imported, replaced } = await replaceImported(personId, rows);
    await rememberSource();
    return NextResponse.json({ ok: true, mode: "lumi-flights", imported, replaced });
  }

  // Otherwise fall back to a running total → brought-forward opening balance.
  const summary = await extractFromDocument({ data, mediaType: file.type }, "logbook");
  const total = summary.ok ? summary.extraction?.totalHours ?? null : flightsResult.broughtForwardTotal ?? null;
  if (total == null || total <= 0) {
    return NextResponse.json({ ok: false, message: "Lumi couldn't read flights or a total from that. Try clearer pages, or import a CSV export." }, { status: 422 });
  }
  const now = new Date();
  await db.logbookSummary.upsert({
    where: { personId },
    update: { totalHours: total, asOf: now, selfDeclared: true },
    create: { personId, totalHours: total, asOf: now, selfDeclared: true },
  });
  await rememberSource();
  return NextResponse.json({ ok: true, mode: "lumi-total", totalHours: total, confidence: summary.extraction?.confidence ?? null, issues: summary.extraction?.issues ?? [] });
}
