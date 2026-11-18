import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseLogbookFile } from "@/lib/logbook-csv";
import { planImport, type ImportMode } from "@/lib/logbook-import";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel rejects request bodies above ~4.5 MB before our code runs (with a non-JSON error), so cap below that.
const MAX_BYTES = 4 * 1024 * 1024;
const PREVIEW_ROWS = 300;
const looksLikeCsv = (f: File) => /\.(csv|txt|tsv)$/i.test(f.name) || /csv|excel|text\//i.test(f.type);

/**
 * POST (multipart) — import a logbook export (CSV / tab-separated text). Two steps, so nothing is saved unseen:
 *   step=preview  → parse and report: what will be saved (with totals), every skipped row and why, warnings,
 *                   duplicates, ignored columns, and (replace mode) what will be removed. Saves NOTHING.
 *   step=confirm  → the same file + options again, plus the preview's token; re-parsed identically and saved.
 * mode=add (default) keeps everything already in the logbook; mode=replace first removes the previous CSV/scan import.
 * Photos and PDFs of a paper logbook go through the scan flow (/api/logbook/scan), where every row is reviewed.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRateLimited(`import:${personId}`, 30, 10 * 60_000)) return NextResponse.json({ ok: false, message: "Too many imports. Please wait a few minutes." }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Upload a file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "Upload a file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ ok: false, message: "File must be between 1 byte and 4 MB." }, { status: 413 });
  if (!looksLikeCsv(file)) {
    return NextResponse.json({ ok: false, message: "That isn't a CSV export. For photos or a PDF of a paper logbook, use “Scan paper logbook”, where you can check every row." }, { status: 415 });
  }

  const step = form.get("step") === "confirm" ? "confirm" : "preview";
  const mode: ImportMode = form.get("mode") === "replace" ? "replace" : "add";
  const keepDuplicates = form.get("keepDuplicates") === "1";
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Binds a confirm to exactly the file and options that were previewed.
  const token = createHash("sha256").update(bytes).update(`|${mode}|${keepDuplicates}`).digest("hex").slice(0, 32);

  const parsed = parseLogbookFile(bytes);
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.error, skipped: parsed.skipped }, { status: 422 });

  const existing = await db.flightLogEntry.findMany({
    where: { personId },
    select: { date: true, departureIcao: true, arrivalIcao: true, aircraftReg: true, totalHours: true, picHours: true, source: true, externalSource: true },
  });
  const plan = planImport(parsed, existing, mode, keepDuplicates);

  if (step === "preview") {
    return NextResponse.json({
      ok: true,
      step: "preview",
      token,
      file: { name: file.name, encoding: parsed.encoding, delimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter, dateOrder: parsed.dateOrder },
      columns: parsed.columns,
      ignoredColumns: parsed.ignoredColumns,
      blankLines: parsed.blankLines,
      totals: plan.saveTotals,
      flights: plan.toSave.slice(0, PREVIEW_ROWS),
      flightsShown: Math.min(plan.toSave.length, PREVIEW_ROWS),
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      duplicatesInFile: plan.duplicatesInFile.map((d) => ({ line: d.line, duplicateOfLine: d.duplicateOfLine, date: d.date, totalHours: d.totalHours })),
      alreadyInLogbook: plan.alreadyInLogbook.map((d) => ({ line: d.line, date: d.date, totalHours: d.totalHours, existingSource: d.existingSource })),
      replacing: plan.replacing,
    });
  }

  if (form.get("token") !== token) {
    return NextResponse.json({ ok: false, message: "The file or options changed since the preview. Please preview it again." }, { status: 409 });
  }
  if (plan.toSave.length === 0) return NextResponse.json({ ok: false, message: "Nothing to save: every row was skipped or is already in your logbook." }, { status: 422 });

  const { removed } = await db.$transaction(async (tx) => {
    const removed = mode === "replace" ? (await tx.flightLogEntry.deleteMany({ where: { personId, source: "IMPORTED", externalSource: null } })).count : 0;
    await tx.flightLogEntry.createMany({
      data: plan.toSave.map((f) => ({
        personId,
        date: new Date(`${f.date}T00:00:00Z`),
        departureIcao: f.departureIcao,
        arrivalIcao: f.arrivalIcao,
        aircraftType: f.aircraftType,
        aircraftReg: f.aircraftReg,
        totalHours: f.totalHours,
        picHours: f.picHours,
        coPilotHours: f.coPilotHours,
        dualHours: f.dualHours,
        instructorHours: f.instructorHours,
        nightHours: f.nightHours,
        instrumentHours: f.instrumentHours,
        multiEngineHours: f.multiEngineHours,
        turbineHours: f.turbineHours,
        dayLandings: f.dayLandings,
        nightLandings: f.nightLandings,
        certifier: f.certifier,
        remarks: f.remarks,
        source: "IMPORTED" as const,
        verified: false,
      })),
    });
    return { removed };
  });

  const provider = String(form.get("provider") ?? "").trim().slice(0, 40);
  const ref = String(form.get("ref") ?? "").trim().slice(0, 60);
  if (provider || ref) await db.person.update({ where: { id: personId }, data: { ...(provider ? { logbookProvider: provider } : {}), ...(ref ? { logbookRef: ref } : {}) } });

  return NextResponse.json({ ok: true, step: "confirm", saved: plan.toSave.length, removed, totals: plan.saveTotals });
}
