import "server-only";
import type { FlightLogEntry, LogbookSummary, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { LumiFlightRow } from "@/lib/lumi";

// Hour categories we roll up everywhere. Keep in sync with FlightLogEntry / LogbookSummary.
export const HOUR_FIELDS = ["totalHours", "picHours", "nightHours", "instrumentHours", "multiEngineHours", "turbineHours"] as const;
export type HourField = (typeof HOUR_FIELDS)[number];

const n = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : typeof v === "number" ? v : Number(v));
const round1 = (x: number) => Math.round(x * 10) / 10;

export interface LogbookTotals {
  grand: Record<HourField, number>;
  broughtForward: Record<HourField, number>;
  logged: Record<HourField, number>;
  entryCount: number;
  lastFlight: Date | null;
}

/** Grand totals = opening balance (LogbookSummary) + the sum of every FlightLogEntry. */
export function rollUp(summary: LogbookSummary | null, entries: Pick<FlightLogEntry, HourField | "date">[]): LogbookTotals {
  const broughtForward = Object.fromEntries(HOUR_FIELDS.map((f) => [f, n(summary?.[f])])) as Record<HourField, number>;
  const logged = Object.fromEntries(HOUR_FIELDS.map((f) => [f, 0])) as Record<HourField, number>;
  let lastFlight: Date | null = summary?.lastFlightAt ?? null;
  for (const e of entries) {
    for (const f of HOUR_FIELDS) logged[f] += n(e[f]);
    if (!lastFlight || e.date > lastFlight) lastFlight = e.date;
  }
  const grand = Object.fromEntries(HOUR_FIELDS.map((f) => [f, round1(broughtForward[f] + logged[f])])) as Record<HourField, number>;
  for (const f of HOUR_FIELDS) logged[f] = round1(logged[f]);
  return { grand, broughtForward, logged, entryCount: entries.length, lastFlight };
}

// ─── SACAA 90-day passenger recency ──────────────────────────────────────────

export interface Currency {
  /** 3 take-offs & landings in the last 90 days carrying passengers (CAR 91). */
  passengerCurrent: boolean;
  landings90: number;
  /** When the current recency lapses (90 days after the 3rd-most-recent landing), if current. */
  lapsesAt: Date | null;
  nightCurrent: boolean;
  nightLandings90: number;
}

/** Recency from logged landings. Honest and simple: it only knows about landings the pilot has logged. */
export function computeCurrency(entries: Pick<FlightLogEntry, "date" | "dayLandings" | "nightLandings">[], now = new Date()): Currency {
  const windowStart = new Date(now.getTime() - 90 * 86_400_000);
  const recent = entries
    .filter((e) => e.date >= windowStart)
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const expand = (pick: (e: (typeof recent)[number]) => number) => {
    const days: Date[] = [];
    for (const e of recent) for (let i = 0; i < pick(e); i++) days.push(e.date);
    return days; // already newest-first because `recent` is
  };
  const allLandingDays = expand((e) => e.dayLandings + e.nightLandings);
  const nightLandingDays = expand((e) => e.nightLandings);

  const lapsesAt = allLandingDays.length >= 3 ? new Date(allLandingDays[2].getTime() + 90 * 86_400_000) : null;
  return {
    passengerCurrent: allLandingDays.length >= 3,
    landings90: allLandingDays.length,
    lapsesAt,
    nightCurrent: nightLandingDays.length >= 3,
    nightLandings90: nightLandingDays.length,
  };
}

// ─── Auto-logging platform flights ───────────────────────────────────────────

/**
 * Create/refresh a FlightLogEntry for every crew request this pilot has flown through Lumiritin. Idempotent
 * (keyed by crewRequestId) and safe to call on every page load. Operator-witnessed, so entries are verified.
 * It never overwrites a pilot's manual edits to hour splits/landings — only backfills missing platform rows.
 */
export async function syncPlatformFlights(personId: string): Promise<number> {
  const filled = await db.crewRequest.findMany({
    where: { assignedPersonId: personId, status: { in: ["FILLED"] } },
    select: {
      id: true,
      departureIcao: true,
      startsAt: true,
      hoursRequired: true,
      requiredRatings: true,
      operator: { select: { name: true } },
      aircraft: { select: { registration: true, typeDesignator: true } },
    },
  });
  if (filled.length === 0) return 0;

  const existing = new Set(
    (await db.flightLogEntry.findMany({ where: { crewRequestId: { in: filled.map((f) => f.id) } }, select: { crewRequestId: true } }))
      .map((e) => e.crewRequestId)
      .filter((x): x is string => !!x),
  );

  const toCreate = filled.filter((f) => !existing.has(f.id));
  if (toCreate.length === 0) return 0;

  await db.flightLogEntry.createMany({
    data: toCreate.map((f) => ({
      personId,
      crewRequestId: f.id,
      date: f.startsAt,
      departureIcao: f.departureIcao,
      aircraftType: f.aircraft?.typeDesignator ?? f.requiredRatings[0] ?? null,
      aircraftReg: f.aircraft?.registration ?? null,
      operatorName: f.operator.name,
      totalHours: f.hoursRequired,
      picHours: f.hoursRequired, // hired crew usually fly PIC; the pilot can adjust
      dayLandings: 1, // a flown sector implies at least one landing; editable
      source: "PLATFORM" as const,
      verified: true,
      remarks: "Auto-logged from a Lumiritin booking",
    })),
    skipDuplicates: true,
  });
  return toCreate.length;
}

// ─── CSV import of an existing digital logbook ───────────────────────────────

// Header aliases so a straight export from the common logbooks lines up without the pilot renaming columns.
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "flightdate", "dateutc"],
  departureIcao: ["from", "departure", "dep", "origin", "fromicao", "route_from"],
  arrivalIcao: ["to", "destination", "dest", "arrival", "toicao", "route_to"],
  aircraftType: ["type", "aircrafttype", "model", "icaotype", "typecode"],
  aircraftReg: ["reg", "registration", "tail", "aircraftid", "ident", "tailnumber"],
  totalHours: ["total", "totaltime", "totalduration", "duration", "totalflighttime", "flighttime"],
  picHours: ["pic", "pichours", "pilotincommand", "p1"],
  coPilotHours: ["copilot", "copilothours", "sic", "secondincommand", "p2"],
  dualHours: ["dual", "dualhours", "dualreceived", "put"],
  instructorHours: ["instructor", "instructorhours", "cfi", "pichoursinstructor", "dualgiven"],
  nightHours: ["night", "nighthours", "nighttime"],
  instrumentHours: ["instrument", "ifr", "actualinstrument", "simulatedinstrument", "instrumenttime"],
  multiEngineHours: ["multi", "multiengine", "me", "multienginetime"],
  turbineHours: ["turbine", "turbinetime"],
  dayLandings: ["daylandings", "dayldg", "landingsday", "landings"],
  nightLandings: ["nightlandings", "nightldg", "landingsnight"],
  remarks: ["remarks", "comments", "notes"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Split a CSV line honouring simple double-quote quoting. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const parseNum = (v: string | undefined): number | null => {
  if (!v) return null;
  const x = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : null;
};
const parseInt0 = (v: string | undefined): number => Math.max(0, Math.round(parseNum(v) ?? 0));

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const s = v.trim();
  // ISO yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00Z`);
  // dd/mm/yyyy or dd-mm-yyyy (SA convention)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T00:00:00Z`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Shared import helpers (CSV, Lumi document, and provider bridges all funnel through here) ──────────────

/** Replace the pilot's previously IMPORTED flights with a fresh set (platform + manual rows are untouched). */
export async function replaceImported(personId: string, rows: Prisma.FlightLogEntryCreateManyInput[]): Promise<{ imported: number; replaced: number }> {
  return db.$transaction(async (tx) => {
    const removed = await tx.flightLogEntry.deleteMany({ where: { personId, source: "IMPORTED" } });
    if (rows.length) await tx.flightLogEntry.createMany({ data: rows });
    return { imported: rows.length, replaced: removed.count };
  });
}

/** Map Lumi's read flight rows (or a provider's normalized rows) to importable entries. */
export function lumiRowsToEntries(rows: LumiFlightRow[], personId: string): Prisma.FlightLogEntryCreateManyInput[] {
  const out: Prisma.FlightLogEntryCreateManyInput[] = [];
  for (const r of rows) {
    if (!r.date || r.total == null || r.total <= 0) continue;
    const date = new Date(`${r.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    out.push({
      personId,
      date,
      departureIcao: r.from?.toUpperCase().slice(0, 8) || null,
      arrivalIcao: r.to?.toUpperCase().slice(0, 8) || null,
      aircraftType: r.aircraftType?.slice(0, 16) || null,
      aircraftReg: r.aircraftReg?.slice(0, 16) || null,
      totalHours: round1(r.total),
      picHours: r.pic ?? null,
      coPilotHours: r.coPilot ?? null,
      dualHours: r.dual ?? null,
      instructorHours: r.instructor ?? null,
      nightHours: r.night ?? null,
      instrumentHours: r.instrument ?? null,
      multiEngineHours: r.multi ?? null,
      turbineHours: r.turbine ?? null,
      dayLandings: Math.max(0, Math.round(r.dayLandings ?? 0)),
      nightLandings: Math.max(0, Math.round(r.nightLandings ?? 0)),
      certifier: r.certifier?.slice(0, 80) || null,
      source: "IMPORTED",
      verified: false,
      remarks: r.remarks?.slice(0, 300) || null,
    });
  }
  return out;
}

export interface CsvImportResult {
  rows: Prisma.FlightLogEntryCreateManyInput[];
  imported: number;
  skipped: number;
  error?: string;
}

/**
 * Parse a digital-logbook CSV export into importable rows. Lenient about column names (see COLUMN_ALIASES) and
 * about date format. A row needs at least a date and a total time to count; everything else is best-effort.
 */
export function parseLogbookCsv(text: string, personId: string): CsvImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], imported: 0, skipped: 0, error: "The file has no data rows." };

  // Find the header row: the first line that contains a recognisable date column AND a total-time column.
  let headerIdx = -1;
  let map: Record<string, number> = {};
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const cells = splitCsvLine(lines[i]).map(normHeader);
    const m: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) m[field] = idx;
    }
    if (m.date != null && m.totalHours != null) { headerIdx = i; map = m; break; }
  }
  if (headerIdx < 0) return { rows: [], imported: 0, skipped: 0, error: "Couldn't find a header row with a date and a total-time column." };

  const rows: Prisma.FlightLogEntryCreateManyInput[] = [];
  let skipped = 0;
  const at = (cells: string[], field: string) => (map[field] != null ? cells[map[field]] : undefined);

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const date = parseDate(at(cells, "date"));
    const total = parseNum(at(cells, "totalHours"));
    if (!date || total == null || total <= 0) { skipped++; continue; }
    rows.push({
      personId,
      date,
      departureIcao: (at(cells, "departureIcao") || "").toUpperCase().slice(0, 8) || null,
      arrivalIcao: (at(cells, "arrivalIcao") || "").toUpperCase().slice(0, 8) || null,
      aircraftType: at(cells, "aircraftType")?.slice(0, 16) || null,
      aircraftReg: at(cells, "aircraftReg")?.slice(0, 16) || null,
      totalHours: round1(total),
      picHours: parseNum(at(cells, "picHours")),
      coPilotHours: parseNum(at(cells, "coPilotHours")),
      dualHours: parseNum(at(cells, "dualHours")),
      instructorHours: parseNum(at(cells, "instructorHours")),
      nightHours: parseNum(at(cells, "nightHours")),
      instrumentHours: parseNum(at(cells, "instrumentHours")),
      multiEngineHours: parseNum(at(cells, "multiEngineHours")),
      turbineHours: parseNum(at(cells, "turbineHours")),
      dayLandings: parseInt0(at(cells, "dayLandings")),
      nightLandings: parseInt0(at(cells, "nightLandings")),
      source: "IMPORTED",
      verified: false,
      remarks: at(cells, "remarks")?.slice(0, 300) || null,
    });
  }
  return { rows, imported: rows.length, skipped };
}
