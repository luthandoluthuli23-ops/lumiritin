import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { decodeLogbookBytes, flightKey, formatHours, importTotals, parseDuration, parseLogbookFile, parseLogDate, type CsvParseResult } from "../lib/logbook-csv";

const TODAY = "2026-11-18";
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, "fixtures", "logbooks", name)));
const parse = (name: string) => parseLogbookFile(fixture(name), { today: TODAY });
const reasons = (r: CsvParseResult) => r.skipped.map((s) => `${s.line}: ${s.reason}`);

/** Every row of the file is accounted for: imported, skipped (with a reason), or a reported duplicate. */
function accountedFor(r: CsvParseResult, dataLines: number[]) {
  const seen = new Set([...r.flights.map((f) => f.line), ...r.skipped.map((s) => s.line), ...r.duplicates.map((d) => d.line)]);
  for (const l of dataLines) assert.ok(seen.has(l), `line ${l} was dropped without a reason`);
}

describe("durations: decimal and hh:mm, never guessed", () => {
  it("reads every common way of writing a duration exactly", () => {
    const cases: [string, number | null][] = [
      ["1.5", 1.5], [".5", 0.5], ["1.25", 1.25], ["1.33", 1.33], ["2", 2], ["1:30", 1.5], ["01:05", 1.0833], ["0:45:30", 0.7583],
      ["1:20", 1.3333], ["2h15m", 2.25], ["1h", 1], ["1h 30m", 1.5], ["90m", 1.5], ["120m", 2], ["1.5h", 1.5], ["", null], ["-", null],
    ];
    for (const [raw, hours] of cases) assert.deepEqual(parseDuration(raw), { hours }, raw);
  });

  it("decimal comma in ;/tab files, and a quoted 1,5 in comma files", () => {
    assert.deepEqual(parseDuration("1,5", true), { hours: 1.5 });
    assert.deepEqual(parseDuration("1,25", false), { hours: 1.25 });
    assert.ok("error" in parseDuration("1,500", false), "1,500 could be a thousands separator: not guessed");
  });

  it("never turns 1:30 into 130 hours or 1,5 into 15 (the old importer's bug)", () => {
    assert.notEqual((parseDuration("1:30") as { hours: number }).hours, 130);
    assert.notEqual((parseDuration("1,5", true) as { hours: number }).hours, 15);
  });

  it("refuses what it can't read exactly", () => {
    for (const raw of ["abc", "25:00", "1:75", "-1", "1.2.3", "two hours"]) assert.ok("error" in parseDuration(raw), raw);
  });
});

describe("dates", () => {
  it("reads ISO, day-first, month names, two-digit years and Excel serials", () => {
    assert.equal(parseLogDate("2026-03-14", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("2026-03-14T08:30:00Z", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("20260314", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("14/03/2026", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("14.03.2026", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("14-Mar-26", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("14 March 2026", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("Mar 14, 2026", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("46095", "DMY"), "2026-03-14");
    assert.equal(parseLogDate("03/04/2026", "DMY"), "2026-04-03");
    assert.equal(parseLogDate("03/04/2026", "MDY"), "2026-03-04");
  });
  it("rejects dates that don't exist", () => {
    for (const raw of ["2026-02-30", "31/04/2026", "2026-13-01", "nonsense"]) assert.equal(parseLogDate(raw, "DMY"), null, raw);
  });
});

describe("real-world CSV fixtures", () => {
  it("ForeFlight-style: preamble and aircraft table skipped, quoted multi-line remarks, extra columns listed", () => {
    const r = parse("foreflight-style.csv");
    assert.equal(r.ok, true, r.error);
    assert.equal(r.flights.length, 4);
    assert.deepEqual(r.flights.map((f) => f.totalHours), [1.4, 1.25, 4.35, 4.4], "1.25 and 4.35 kept exactly (no rounding to 0.1)");
    assert.equal(r.flights[1].remarks, "Return leg, gusty\nsecond line of the remark");
    assert.equal(r.flights[2].remarks, 'He said "all good"');
    assert.equal(r.flights[1].instrumentHours, 0.3, "actual + simulated instrument added together");
    assert.equal(r.flights[2].departureIcao, "FALA");
    assert.equal(r.flights[2].arrivalIcao, "FACT");
    assert.deepEqual(r.ignoredColumns, ["Hobbs Start"]);
    assert.ok(r.blankLines >= 1);
    assert.equal(importTotals(r.flights).hours.totalHours, 11.4);
  });

  it("SA Excel: semicolons, decimal commas, day-first dates, BOM; totals and brought-forward lines reported, not imported", () => {
    const r = parse("sa-excel-semicolon.csv");
    assert.equal(r.delimiter, ";");
    assert.equal(r.dateOrder, "DMY");
    assert.deepEqual(r.flights.map((f) => [f.date, f.totalHours]), [["2026-02-03", 1.2], ["2026-02-14", 1.5], ["2026-02-21", 1.4]]);
    assert.equal(r.flights[1].nightHours, 0.3);
    assert.equal(r.skipped.length, 2);
    assert.ok(r.skipped.every((s) => /Totals \/ brought-forward/.test(s.reason)), reasons(r).join("; "));
    assert.equal(importTotals(r.flights).hours.totalHours, 4.1, "matches the page total in the file");
  });

  it("hh:mm durations and mixed date styles", () => {
    const r = parse("hhmm-durations.csv");
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.flights.map((f) => f.totalHours), [1.3333, 1.0833, 0.7583, 2.25, 1.5]);
    assert.deepEqual(r.flights.map((f) => f.date), ["2026-03-14", "2026-03-15", "2026-03-16", "2026-04-02", "2026-04-03"]);
    assert.equal(r.flights[1].nightHours, 0.5833);
    assert.equal(r.flights[1].dayLandings, 0, "1 landing total, 1 at night → 0 by day");
    assert.equal(r.flights[1].nightLandings, 1);
    // Exact to the minute when added up.
    assert.equal(formatHours(importTotals(r.flights).hours.totalHours), "6.9249 h (6:55)");
  });

  it("US exports: month-first order is detected from the file, not assumed", () => {
    const r = parse("us-month-first.csv");
    assert.equal(r.dateOrder, "MDY");
    assert.deepEqual(r.flights.map((f) => f.date), ["2026-03-04", "2026-03-25"]);
  });

  it("a file mixing day-first and month-first dates is refused, not guessed", () => {
    const r = parse("mixed-date-order.csv");
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /mix day\/month and month\/day/);
  });

  it("messy rows: every skipped row has a reason, nothing disappears, warnings keep values as-is", () => {
    const r = parse("messy-rows.csv");
    assert.equal(r.ok, true, r.error);
    accountedFor(r, [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]);
    const why = reasons(r).join("\n");
    assert.match(why, /4: No date/);
    assert.match(why, /5: No total flight time/);
    assert.match(why, /6: Total: "abc" isn't a time/);
    assert.match(why, /7: Total: "25:00" is more than 24 hours/);
    assert.match(why, /8: Date 2027-12-31 is in the future/);
    assert.match(why, /9: Date "2026-02-30" isn't a real date/);
    assert.match(why, /11: Night landings \(2\) are more than total landings \(1\)/);
    assert.match(why, /15: Totals \/ brought-forward/);
    // "Total electrical failure drill" is a real flight, not a totals line.
    assert.ok(r.flights.some((f) => f.remarks === "Total electrical failure drill"));
    // PIC > total is imported unchanged, with a warning.
    const odd = r.flights.find((f) => f.line === 10)!;
    assert.equal(odd.picHours, 2.0);
    assert.equal(odd.totalHours, 1.5);
    assert.equal(odd.dayLandings, 2, "3 landings, 1 at night");
    assert.ok(r.warnings.some((w) => w.line === 10 && /more than the total/.test(w.reason)));
    // The exact repeat of line 2 is a reported duplicate, not a second flight.
    assert.equal(r.duplicates.length, 1);
    assert.equal(r.duplicates[0].line, 13);
    assert.equal(r.duplicates[0].duplicateOfLine, 2);
    assert.deepEqual(r.ignoredColumns, ["Extra column A", "Extra column B"]);
    assert.ok(r.blankLines >= 2);
  });

  it("MyFlightbook-style: route column, total vs night landings, IMC + simulated", () => {
    const r = parse("myflightbook-style.csv");
    assert.deepEqual(r.flights.map((f) => [f.departureIcao, f.arrivalIcao]), [["FALA", "FAPM"], ["FAPM", "FACT"]]);
    assert.deepEqual(r.flights.map((f) => f.totalHours), [1.33, 3.17]);
    assert.equal(r.flights[0].instrumentHours, 0.3);
    assert.deepEqual(r.flights.map((f) => [f.dayLandings, f.nightLandings]), [[2, 0], [2, 1]]);
  });

  it("Windows-1252 file (old Excel): accents survive, hours unchanged", () => {
    const r = parse("windows-1252.csv");
    assert.equal(r.encoding, "Windows-1252");
    assert.deepEqual(r.flights.map((f) => f.remarks), ["Café run – Kruger", "Renée on board"]);
    assert.deepEqual(r.flights.map((f) => f.totalHours), [1.6, 1.7]);
  });

  it("UTF-16 tab-separated (Excel 'Unicode text')", () => {
    const r = parse("utf16le-tab.txt");
    assert.equal(r.encoding, "UTF-16 LE");
    assert.equal(r.delimiter, "\t");
    assert.equal(r.flights[0].remarks, "Zoë");
    assert.equal(importTotals(r.flights).hours.totalHours, 1.9);
  });

  it("refuses a file with no recognisable header", () => {
    const r = parseLogbookFile(new TextEncoder().encode("a,b,c\n1,2,3\n"), { today: TODAY });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /header row/);
  });
});

describe("totals and duplicates", () => {
  it("totals are exact over thousands of rows (no floating-point drift)", () => {
    const flights = Array.from({ length: 3000 }, () => ({ date: "2026-01-01", totalHours: 0.1, picHours: 0.1, coPilotHours: null, dualHours: null, instructorHours: null, nightHours: null, instrumentHours: null, multiEngineHours: null, turbineHours: null, dayLandings: 1, nightLandings: 0 }));
    const t = importTotals(flights);
    assert.equal(t.hours.totalHours, 300);
    assert.equal(t.dayLandings, 3000);
  });

  it("duplicate key ignores reg punctuation and case but not times", () => {
    const a = { date: "2026-01-01", departureIcao: "FALA", arrivalIcao: "FAPM", aircraftReg: "ZS-HLA", totalHours: 1.3, picHours: 1.3 };
    assert.equal(flightKey(a), flightKey({ ...a, aircraftReg: "zshla" }));
    assert.notEqual(flightKey(a), flightKey({ ...a, totalHours: 1.4 }));
    assert.equal(flightKey(a), flightKey({ ...a, date: new Date("2026-01-01T00:00:00Z"), totalHours: "1.3" }), "matches rows read back from the database");
  });

  it("decoding: valid UTF-8 stays UTF-8", () => {
    assert.equal(decodeLogbookBytes(new TextEncoder().encode("Zoë")).encoding, "UTF-8");
  });
});
