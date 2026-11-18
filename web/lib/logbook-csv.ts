// Logbook CSV import: pure, so every rule can be tested with real-world-shaped fixtures.
//
// The one rule above all others: NEVER silently drop or alter hours. Every row that isn't imported is reported with a
// reason; every value that can't be read exactly is an error on that row (not a guess, not a zero); nothing is rounded
// beyond 0.0001 h (a third of a second). The pilot sees a preview with totals, skipped rows and warnings before saving.
//
// Handles: UTF-8 (with/without BOM), UTF-16 LE/BE (Excel "Unicode text"), Windows-1252 (old Excel); comma, semicolon
// and tab delimiters; quoted fields with commas, quotes and line breaks; blank lines; extra columns; totals / brought-
// forward rows; decimal hours (1.5 and 1,5) and durations (1:30, 1:30:00, 1h30m, 90m); many date formats, with day/month
// order detected for the whole file; duplicate flights.

export const HOUR_FIELDS = ["totalHours", "picHours", "coPilotHours", "dualHours", "instructorHours", "nightHours", "instrumentHours", "multiEngineHours", "turbineHours"] as const;
export type HourField = (typeof HOUR_FIELDS)[number];

export interface ParsedFlight {
  /** 1-based line number in the file (for the report). */
  line: number;
  date: string; // YYYY-MM-DD
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftType: string | null;
  aircraftReg: string | null;
  totalHours: number;
  picHours: number | null;
  coPilotHours: number | null;
  dualHours: number | null;
  instructorHours: number | null;
  nightHours: number | null;
  instrumentHours: number | null;
  multiEngineHours: number | null;
  turbineHours: number | null;
  dayLandings: number;
  nightLandings: number;
  certifier: string | null;
  remarks: string | null;
}

export interface RowIssue {
  line: number;
  reason: string;
  /** The original row, shortened, so the pilot can find it. */
  raw: string;
}

export interface CsvParseResult {
  ok: boolean;
  error?: string;
  encoding: string;
  delimiter: string;
  dateOrder: "DMY" | "MDY" | null;
  /** Which file column feeds which field. */
  columns: { field: string; header: string }[];
  /** Columns in the file that aren't imported (listed so nothing disappears unnoticed). */
  ignoredColumns: string[];
  flights: ParsedFlight[];
  skipped: RowIssue[];
  /** Imported, but worth a look (e.g. PIC more than total). Values are kept exactly as in the file. */
  warnings: RowIssue[];
  /** Exact repeats of an earlier row in the same file: not imported unless the pilot chooses to keep them. */
  duplicates: (ParsedFlight & { duplicateOfLine: number })[];
  blankLines: number;
}

// ── Decoding ──────────────────────────────────────────────────────────────────

/** Decode file bytes without mangling characters: BOM → that encoding; valid UTF-8 → UTF-8; otherwise Windows-1252. */
export function decodeLogbookBytes(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8 (BOM)" };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16 LE" };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16 BE" };
  // UTF-16 without a BOM: lots of zero bytes in alternate positions.
  const sample = bytes.subarray(0, Math.min(bytes.length, 400));
  let zeroOdd = 0;
  let zeroEven = 0;
  sample.forEach((b, i) => b === 0 && (i % 2 ? zeroOdd++ : zeroEven++));
  if (sample.length > 20 && zeroOdd > sample.length / 4) return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "UTF-16 LE" };
  if (sample.length > 20 && zeroEven > sample.length / 4) return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "UTF-16 BE" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" };
  }
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** RFC 4180 parsing: quoted fields may contain the delimiter, doubled quotes and line breaks. Returns records with their line. */
export function parseCsv(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = "";
  let q = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else {
        if (c === "\n") line++;
        cur += c;
      }
      continue;
    }
    if (c === '"' && cur.trim() === "") {
      q = true;
      cur = "";
    } else if (c === delimiter) {
      cells.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cells.push(cur);
      out.push({ line: startLine, cells });
      cells = [];
      cur = "";
      line++;
      startLine = line;
    } else cur += c;
  }
  if (cur !== "" || cells.length) {
    cells.push(cur);
    out.push({ line: startLine, cells });
  }
  return out.map((r) => ({ line: r.line, cells: r.cells.map((s) => s.trim()) }));
}

/** The delimiter that splits the header-ish lines most consistently (comma, semicolon, tab or pipe). */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => parseCsv(l, d)[0]?.cells.length ?? 1);
    const maxCols = Math.max(...counts, 1);
    if (maxCols < 2) continue;
    const score = counts.filter((c) => c === maxCols).length * 100 + maxCols;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

// ── Values ────────────────────────────────────────────────────────────────────

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * A duration in hours. Accepts 1.5 · 1,5 (decimal comma) · 1:30 · 01:30:00 · 1h30 · 1h 30m · 1.5h · 90m · .5
 * Returns null for an empty cell, or an error for anything it can't read exactly (never a guess).
 */
export function parseDuration(raw: string | undefined, decimalComma = false): { hours: number | null } | { error: string } {
  const s = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || s === "-" || s === "—") return { hours: null };
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/))) return check(Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600, s);
  if ((m = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d{1,4})\s*m(?:in(?:s|utes?)?)?)?$/)) && (m[1] || m[2])) {
    return check(Number((m[1] ?? "0").replace(",", ".")) + Number(m[2] ?? 0) / 60, s);
  }
  if ((m = s.match(/^(\d*)\.(\d+)$/)) || (m = s.match(/^(\d+)$/))) return check(Number(s), s);
  // Decimal comma: always in ;/tab files; in a comma file only a quoted "1,5" can reach here, and 1-2 decimals
  // can't be a thousands separator. "1,500" stays an error rather than a guess.
  if ((m = s.match(/^(\d*),(\d+)$/)) && (decimalComma || m[2].length <= 2)) return check(Number(s.replace(",", ".")), s);
  return { error: `"${raw}" isn't a time we can read (use 1.5 or 1:30)` };
}
function check(h: number, s: string): { hours: number } | { error: string } {
  if (!Number.isFinite(h) || h < 0) return { error: `"${s}" isn't a valid time` };
  if (h > 24) return { error: `"${s}" is more than 24 hours for one flight` };
  return { hours: round4(h) };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "Mar", "March", "Sept" → 3, 3, 9. A word that isn't a month (or a prefix of one) → null. */
function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  if (MONTHS[w]) return MONTHS[w];
  const i = MONTH_NAMES.findIndex((n) => w.length >= 3 && n.startsWith(w));
  return i >= 0 ? i + 1 : null;
}
const pad = (n: number) => String(n).padStart(2, "0");
function ymd(y: number, mo: number, d: number): string | null {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // 31/02 etc.
  return `${y}-${pad(mo)}-${pad(d)}`;
}
const fullYear = (y: string) => (y.length === 4 ? Number(y) : Number(y) + (Number(y) > 60 ? 1900 : 2000));

/** The two leading numbers of an a/b/yyyy date, for working out the file's day/month order. */
export function numericParts(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s|T|$)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A date as YYYY-MM-DD. `order` settles 03/04/2027 (DMY = 3 April, MDY = 4 March). */
export function parseLogDate(raw: string | undefined, order: "DMY" | "MDY"): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:[T\s].*)?$/))) {
    const [a, b, y] = [+m[1], +m[2], fullYear(m[3])];
    return order === "DMY" ? ymd(y, b, a) : ymd(y, a, b);
  }
  if ((m = s.match(/^(\d{1,2})[\s\-/]([a-z]{3,9})\.?[\s\-/,]+(\d{2}|\d{4})$/i)) && monthOf(m[2])) return ymd(fullYear(m[3]), monthOf(m[2])!, +m[1]);
  if ((m = s.match(/^([a-z]{3,9})\.?[\s\-/]+(\d{1,2}),?[\s\-/]+(\d{4})$/i)) && monthOf(m[1])) return ymd(+m[3], monthOf(m[1])!, +m[2]);
  // Excel serial day number (Excel exports dates as plain numbers when a cell is formatted as General).
  if ((m = s.match(/^(\d{5})$/)) && +m[1] > 20000 && +m[1] < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86_400_000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

// ── Columns ───────────────────────────────────────────────────────────────────

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** File header → field. Several headers may feed one field only where noted (instrument = actual + simulated). */
const ALIASES: Record<string, string[]> = {
  date: ["date", "flightdate", "dateutc", "flightflightdate", "dateofflight"],
  departureIcao: ["from", "departure", "dep", "origin", "fromicao", "routefrom", "flightfrom", "departureairport"],
  arrivalIcao: ["to", "destination", "dest", "arrival", "toicao", "routeto", "flightto", "arrivalairport"],
  route: ["route", "flightroute"],
  aircraftType: ["type", "aircrafttype", "model", "icaotype", "typecode", "flightaircrafttype", "make"],
  aircraftReg: ["reg", "registration", "tail", "tailnumber", "aircraftid", "ident", "flightaircraftid", "aircraftreg"],
  totalHours: ["total", "totaltime", "totalduration", "duration", "totalflighttime", "flighttime", "flighttotaltime", "blocktime", "totalhours"],
  picHours: ["pic", "pichours", "pilotincommand", "p1", "flightpic"],
  coPilotHours: ["copilot", "copilothours", "sic", "secondincommand", "p2", "flightsic"],
  dualHours: ["dual", "dualhours", "dualreceived", "put", "flightdualreceived"],
  instructorHours: ["instructor", "instructorhours", "cfi", "dualgiven", "flightdualgiven"],
  nightHours: ["night", "nighthours", "nighttime", "flightnight"],
  instrumentHours: ["instrument", "ifr", "instrumenttime", "imc", "actualinstrument", "simulatedinstrument", "simulatedifr", "flightactualinstrument", "flightsimulatedinstrument"],
  multiEngineHours: ["multi", "multiengine", "me", "multienginetime"],
  turbineHours: ["turbine", "turbinetime"],
  dayLandings: ["daylandings", "dayldg", "landingsday", "fsdaylandings", "daylandingsfullstop", "flightdaylandings"],
  nightLandings: ["nightlandings", "nightldg", "landingsnight", "fsnightlandings", "nightlandingsfullstop", "flightnightlandings"],
  totalLandings: ["landings", "alllandings", "totallandings", "ldg"],
  certifier: ["certifier", "certifiedby", "signature", "instructorsignature"],
  remarks: ["remarks", "comments", "notes", "flightremarks", "comment", "pilotcomments"],
};
/** Fields that may legitimately come from more than one column (summed, and the preview says so). */
const SUMMED = new Set(["instrumentHours"]);

/** Any cell of an UNDATED row saying this → a totals line. */
const TOTALS_ANY = /\b(totals?|brought\s*forward|carried\s*forward|b\/f|c\/f|page\s*total|grand\s*total|opening\s*balance)\b/i;
/** A date or remarks cell that IS a totals label (a remark that merely mentions "total", e.g. "total electrical failure", isn't). */
const TOTALS_LABEL = /^\s*((page|grand)\s+)?totals?\s*:?\s*$|brought\s*forward|carried\s*forward|^\s*[bc]\/f\b|opening\s*balance/i;
const MAX_ISSUE_RAW = 140;
const rawOf = (cells: string[]) => cells.join(" | ").slice(0, MAX_ISSUE_RAW);
const icao = (s: string | undefined) => (s ? s.trim().toUpperCase().slice(0, 8) || null : null);
const text = (s: string | undefined, max: number) => (s ? s.trim().slice(0, max) || null : null);

export function parseLogbookFile(bytes: Uint8Array, opts: { today?: string } = {}): CsvParseResult {
  const { text: content, encoding } = decodeLogbookBytes(bytes);
  const delimiter = detectDelimiter(content);
  const records = parseCsv(content, delimiter);
  const base: CsvParseResult = { ok: false, encoding, delimiter, dateOrder: null, columns: [], ignoredColumns: [], flights: [], skipped: [], warnings: [], duplicates: [], blankLines: 0 };

  // Header: the first record (within the first 30) that has a date column and a total-time column.
  let headerAt = -1;
  let map: Record<string, number[]> = {};
  for (let i = 0; i < Math.min(records.length, 30); i++) {
    const heads = records[i].cells.map(norm);
    const m: Record<string, number[]> = {};
    heads.forEach((h, col) => {
      for (const [field, names] of Object.entries(ALIASES)) if (names.includes(h)) (m[field] ??= []).push(col);
    });
    if (m.date && m.totalHours) {
      headerAt = i;
      map = m;
      break;
    }
  }
  if (headerAt < 0) return { ...base, error: "Couldn't find a header row with a date column and a total-time column." };

  const header = records[headerAt].cells;
  // One column per field, except the summed ones; extra matches are reported as ignored.
  const used = new Set<number>();
  const columns: CsvParseResult["columns"] = [];
  for (const [field, cols] of Object.entries(map)) {
    const take = SUMMED.has(field) ? cols : cols.slice(0, 1);
    take.forEach((c) => {
      used.add(c);
      columns.push({ field, header: header[c] });
    });
  }
  const ignoredColumns = header.filter((h, i) => h && !used.has(i));
  const decimalComma = delimiter !== ",";

  // Work out day/month order for the whole file from every unambiguous date.
  const dataRows = records.slice(headerAt + 1);
  let dmy = 0;
  let mdy = 0;
  for (const r of dataRows) {
    const p = numericParts(r.cells[map.date[0]] ?? "");
    if (p && p[0] > 12 && p[1] <= 12) dmy++;
    if (p && p[1] > 12 && p[0] <= 12) mdy++;
  }
  if (dmy && mdy) return { ...base, columns, ignoredColumns, error: "The dates mix day/month and month/day order, so we can't read them safely. Export with ISO dates (YYYY-MM-DD)." };
  const dateOrder: "DMY" | "MDY" = mdy ? "MDY" : "DMY";
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const out: CsvParseResult = { ...base, ok: true, dateOrder, columns, ignoredColumns };
  if (!dmy && !mdy && dataRows.some((r) => numericParts(r.cells[map.date[0]] ?? ""))) {
    out.warnings.push({ line: records[headerAt].line, reason: "Every date could be read either way round; they were read as day/month/year (South African order). Check the dates below.", raw: "" });
  }

  const at = (cells: string[], field: string) => (map[field] ? cells[map[field][0]] : undefined);
  const seen = new Map<string, number>();

  for (const r of dataRows) {
    const cells = r.cells;
    if (cells.every((c) => c === "")) {
      out.blankLines++;
      continue;
    }
    const rawDate = at(cells, "date") ?? "";
    // Totals / brought-forward lines are not flights: report them, never import their hours.
    if ((!rawDate && cells.some((c) => TOTALS_ANY.test(c))) || TOTALS_LABEL.test(rawDate) || TOTALS_LABEL.test(at(cells, "remarks") ?? "")) {
      out.skipped.push({ line: r.line, reason: "Totals / brought-forward line, not a flight", raw: rawOf(cells) });
      continue;
    }
    if (!rawDate) {
      out.skipped.push({ line: r.line, reason: "No date", raw: rawOf(cells) });
      continue;
    }
    const date = parseLogDate(rawDate, dateOrder);
    if (!date) {
      out.skipped.push({ line: r.line, reason: `Date "${rawDate}" isn't a real date we can read`, raw: rawOf(cells) });
      continue;
    }
    if (date > today) {
      out.skipped.push({ line: r.line, reason: `Date ${date} is in the future`, raw: rawOf(cells) });
      continue;
    }

    const hours: Partial<Record<HourField, number | null>> = {};
    let rowError: string | null = null;
    for (const f of HOUR_FIELDS) {
      const cols = map[f] ?? [];
      let sum: number | null = null;
      for (const c of SUMMED.has(f) ? cols : cols.slice(0, 1)) {
        const d = parseDuration(cells[c], decimalComma);
        if ("error" in d) {
          rowError = `${header[c]}: ${d.error}`;
          break;
        }
        if (d.hours !== null) sum = round4((sum ?? 0) + d.hours);
      }
      if (rowError) break;
      hours[f] = sum;
    }
    if (rowError) {
      out.skipped.push({ line: r.line, reason: rowError, raw: rawOf(cells) });
      continue;
    }
    if (!hours.totalHours || hours.totalHours <= 0) {
      out.skipped.push({ line: r.line, reason: "No total flight time", raw: rawOf(cells) });
      continue;
    }

    const count = (v: string | undefined): number | null | "bad" => {
      const s = (v ?? "").trim();
      if (!s) return null;
      return /^\d{1,3}$/.test(s) ? Number(s) : "bad";
    };
    const dayL = count(at(cells, "dayLandings"));
    const nightL = count(at(cells, "nightLandings"));
    const allL = count(at(cells, "totalLandings"));
    if (dayL === "bad" || nightL === "bad" || allL === "bad") {
      out.skipped.push({ line: r.line, reason: "Landings must be a whole number", raw: rawOf(cells) });
      continue;
    }
    let dayLandings = dayL ?? 0;
    const nightLandings = nightL ?? 0;
    if (dayL === null && allL !== null) {
      // A total landings column: day = total − night (when night is given separately).
      dayLandings = allL - nightLandings;
      if (dayLandings < 0) {
        out.skipped.push({ line: r.line, reason: `Night landings (${nightLandings}) are more than total landings (${allL})`, raw: rawOf(cells) });
        continue;
      }
    }

    let departureIcao = icao(at(cells, "departureIcao"));
    let arrivalIcao = icao(at(cells, "arrivalIcao"));
    if ((!departureIcao || !arrivalIcao) && at(cells, "route")) {
      const stops = (at(cells, "route") ?? "").toUpperCase().split(/[\s,\-–>]+/).filter((t) => /^[A-Z0-9]{3,4}$/.test(t));
      departureIcao ??= stops[0] ?? null;
      arrivalIcao ??= stops[stops.length - 1] ?? null;
    }

    const flight: ParsedFlight = {
      line: r.line,
      date,
      departureIcao,
      arrivalIcao,
      aircraftType: text(at(cells, "aircraftType"), 16),
      aircraftReg: text(at(cells, "aircraftReg"), 16)?.toUpperCase() ?? null,
      totalHours: hours.totalHours,
      picHours: hours.picHours ?? null,
      coPilotHours: hours.coPilotHours ?? null,
      dualHours: hours.dualHours ?? null,
      instructorHours: hours.instructorHours ?? null,
      nightHours: hours.nightHours ?? null,
      instrumentHours: hours.instrumentHours ?? null,
      multiEngineHours: hours.multiEngineHours ?? null,
      turbineHours: hours.turbineHours ?? null,
      dayLandings,
      nightLandings,
      certifier: text(at(cells, "certifier"), 80),
      remarks: text(at(cells, "remarks"), 300),
    };

    for (const f of HOUR_FIELDS) {
      const v = flight[f];
      if (f !== "totalHours" && v !== null && v > flight.totalHours) out.warnings.push({ line: r.line, reason: `${f.replace("Hours", "")} time ${v} is more than the total ${flight.totalHours}. Kept as in your file.`, raw: rawOf(cells) });
    }
    if (map.instrumentHours && map.instrumentHours.length > 1 && flight.instrumentHours) {
      // Not an error: just make the summing visible once.
      if (!out.warnings.some((w) => w.reason.startsWith("Instrument time is"))) {
        out.warnings.push({ line: records[headerAt].line, reason: `Instrument time is ${map.instrumentHours.map((c) => header[c]).join(" + ")}, added together.`, raw: "" });
      }
    }

    const key = flightKey(flight);
    const first = seen.get(key);
    if (first !== undefined) {
      out.duplicates.push({ ...flight, duplicateOfLine: first });
      continue;
    }
    seen.set(key, r.line);
    out.flights.push(flight);
  }
  return out;
}

/** Identity of a flight for duplicate detection (same day, route, aircraft and times). */
export function flightKey(f: { date: string | Date; departureIcao: string | null; arrivalIcao: string | null; aircraftReg: string | null; totalHours: number | string | { toString(): string }; picHours?: number | string | { toString(): string } | null }): string {
  const d = typeof f.date === "string" ? f.date : f.date.toISOString().slice(0, 10);
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? "" : round4(Number(String(v))).toFixed(4));
  return [d, f.departureIcao ?? "", f.arrivalIcao ?? "", (f.aircraftReg ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase(), n(f.totalHours), n(f.picHours)].join("|");
}

// ── Totals ────────────────────────────────────────────────────────────────────

export interface ImportTotals {
  flights: number;
  hours: Record<HourField, number>;
  dayLandings: number;
  nightLandings: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Exact totals (summed in 1/10000 h integers, so no floating-point drift over thousands of rows). */
export function importTotals(flights: readonly Pick<ParsedFlight, HourField | "date" | "dayLandings" | "nightLandings">[]): ImportTotals {
  const units = Object.fromEntries(HOUR_FIELDS.map((f) => [f, 0])) as Record<HourField, number>;
  let day = 0;
  let night = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const f of flights) {
    for (const h of HOUR_FIELDS) units[h] += Math.round((f[h] ?? 0) * 10_000);
    day += f.dayLandings;
    night += f.nightLandings;
    if (!first || f.date < first) first = f.date;
    if (!last || f.date > last) last = f.date;
  }
  const hours = Object.fromEntries(HOUR_FIELDS.map((f) => [f, units[f] / 10_000])) as Record<HourField, number>;
  return { flights: flights.length, hours, dayLandings: day, nightLandings: night, firstDate: first, lastDate: last };
}

/** "1234.5 h (1234:30)": decimal and hh:mm, so a pilot who logs in either can check the total. */
export function formatHours(h: number): string {
  const mins = Math.round(h * 60);
  return `${round4(h)} h (${Math.floor(mins / 60)}:${pad(mins % 60)})`;
}
