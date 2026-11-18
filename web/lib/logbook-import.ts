// What an import will actually do, worked out BEFORE anything is saved (the preview), and again identically on confirm.
// Pure: given the parsed file and the pilot's existing flights, decide what is saved, what is skipped and why.
import { flightKey, importTotals, type CsvParseResult, type ImportTotals, type ParsedFlight } from "./logbook-csv";

export type ImportMode = "add" | "replace";

export interface ExistingFlight {
  date: Date;
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftReg: string | null;
  totalHours: number | string | { toString(): string };
  picHours: number | string | { toString(): string } | null;
  source: string; // PLATFORM | IMPORTED | MANUAL
  externalSource: string | null; // e.g. "myflightbook"
}

export interface ImportPlan {
  toSave: ParsedFlight[];
  saveTotals: ImportTotals;
  /** Rows matching a flight already in the logbook (that will stay). Not saved unless keepDuplicates. */
  alreadyInLogbook: (ParsedFlight & { existingSource: string })[];
  /** Exact repeats inside the file. Not saved unless keepDuplicates. */
  duplicatesInFile: CsvParseResult["duplicates"];
  /** "replace" mode only: the previously imported flights that will be removed first. */
  replacing: { flights: number; totals: ImportTotals } | null;
}

const describeSource = (e: ExistingFlight) => (e.externalSource === "myflightbook" ? "MyFlightbook" : e.source === "PLATFORM" ? "a Lumiritin flight" : e.source === "MANUAL" ? "a flight you added" : "an earlier import");
const isPreviousImport = (e: ExistingFlight) => e.source === "IMPORTED" && e.externalSource === null;

export function planImport(parsed: CsvParseResult, existing: readonly ExistingFlight[], mode: ImportMode, keepDuplicates: boolean): ImportPlan {
  // In replace mode the previous CSV/scan imports are removed first, so they don't count as "already there".
  const staying = mode === "replace" ? existing.filter((e) => !isPreviousImport(e)) : existing;
  const byKey = new Map(staying.map((e) => [flightKey({ ...e, date: e.date }), e]));

  const toSave: ParsedFlight[] = [];
  const alreadyInLogbook: ImportPlan["alreadyInLogbook"] = [];
  for (const f of parsed.flights) {
    const match = byKey.get(flightKey(f));
    if (match && !keepDuplicates) alreadyInLogbook.push({ ...f, existingSource: describeSource(match) });
    else toSave.push(f);
  }
  if (keepDuplicates) toSave.push(...parsed.duplicates.map(({ duplicateOfLine: _d, ...f }) => f));
  toSave.sort((a, b) => a.line - b.line);

  const removed = mode === "replace" ? existing.filter(isPreviousImport) : [];
  const asTotalsRow = (e: ExistingFlight) => ({
    date: e.date.toISOString().slice(0, 10),
    totalHours: Number(String(e.totalHours)),
    picHours: e.picHours === null ? null : Number(String(e.picHours)),
    coPilotHours: null, dualHours: null, instructorHours: null, nightHours: null, instrumentHours: null, multiEngineHours: null, turbineHours: null,
    dayLandings: 0, nightLandings: 0,
  });
  return {
    toSave,
    saveTotals: importTotals(toSave),
    alreadyInLogbook,
    duplicatesInFile: keepDuplicates ? [] : parsed.duplicates,
    replacing: mode === "replace" ? { flights: removed.length, totals: importTotals(removed.map(asTotalsRow)) } : null,
  };
}
