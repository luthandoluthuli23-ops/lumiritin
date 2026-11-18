// Full logbook export (CSV), available to the pilot at any time. The column names are ones our own importer reads, so
// an export can be re-imported (or opened in Excel / another logbook) without losing anything. The brought-forward
// opening balance, if any, is the first row, labelled so every importer (ours included) treats it as a totals line.

export interface ExportEntry {
  date: Date;
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftType: string | null;
  aircraftReg: string | null;
  totalHours: unknown;
  picHours: unknown;
  coPilotHours: unknown;
  dualHours: unknown;
  instructorHours: unknown;
  nightHours: unknown;
  instrumentHours: unknown;
  multiEngineHours: unknown;
  turbineHours: unknown;
  dayLandings: number;
  nightLandings: number;
  certifier: string | null;
  remarks: string | null;
  source: string;
  externalSource: string | null;
  verified: boolean;
}

export interface ExportSummary {
  asOf: Date;
  totalHours: unknown;
  picHours?: unknown;
  nightHours?: unknown;
  instrumentHours?: unknown;
}

export const EXPORT_HEADER = [
  "Date", "From", "To", "Aircraft type", "Registration", "Total", "PIC", "Co-pilot", "Dual", "Instructor", "Night", "Instrument",
  "Multi-engine", "Turbine", "Day landings", "Night landings", "Certifier", "Remarks", "Source", "Verified",
];

/** A cell, quoted when needed. Cells starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Hours as exact decimal text: 1.2500 → 1.25, 1.0000 → 1, null → "". */
export function hoursText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(String(v));
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10_000) / 10_000);
}

const SOURCE_LABEL: Record<string, string> = { PLATFORM: "Lumiritin flight", IMPORTED: "Imported", MANUAL: "Added by you (typed or scanned)" };

export function buildLogbookCsv(entries: readonly ExportEntry[], summary: ExportSummary | null): string {
  const rows: string[][] = [EXPORT_HEADER];
  if (summary) {
    rows.push([
      summary.asOf.toISOString().slice(0, 10), "", "", "", "", hoursText(summary.totalHours), hoursText(summary.picHours), "", "", "",
      hoursText(summary.nightHours), hoursText(summary.instrumentHours), "", "", "", "", "", "Brought forward (opening balance)", "Brought forward", "",
    ]);
  }
  for (const e of [...entries].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    rows.push([
      e.date.toISOString().slice(0, 10),
      e.departureIcao ?? "",
      e.arrivalIcao ?? "",
      e.aircraftType ?? "",
      e.aircraftReg ?? "",
      hoursText(e.totalHours),
      hoursText(e.picHours),
      hoursText(e.coPilotHours),
      hoursText(e.dualHours),
      hoursText(e.instructorHours),
      hoursText(e.nightHours),
      hoursText(e.instrumentHours),
      hoursText(e.multiEngineHours),
      hoursText(e.turbineHours),
      String(e.dayLandings),
      String(e.nightLandings),
      e.certifier ?? "",
      e.remarks ?? "",
      e.externalSource === "myflightbook" ? "MyFlightbook" : (SOURCE_LABEL[e.source] ?? e.source),
      e.verified ? "yes" : "no",
    ]);
  }
  // UTF-8 BOM so Excel opens accents correctly; CRLF line endings for Windows tools.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
