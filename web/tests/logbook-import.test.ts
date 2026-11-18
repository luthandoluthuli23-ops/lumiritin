import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { importTotals, parseLogbookFile } from "../lib/logbook-csv";
import { buildLogbookCsv, csvCell, hoursText, type ExportEntry } from "../lib/logbook-export";
import { planImport, type ExistingFlight } from "../lib/logbook-import";

const TODAY = "2026-11-18";
const parsedFixture = (name: string) => parseLogbookFile(new Uint8Array(readFileSync(join(__dirname, "fixtures", "logbooks", name))), { today: TODAY });

const existing = (over: Partial<ExistingFlight>): ExistingFlight => ({
  date: new Date("2026-03-02T00:00:00Z"), departureIcao: "FALA", arrivalIcao: "FAPM", aircraftReg: "ZS-HLA", totalHours: "1.4", picHours: "1.4", source: "MANUAL", externalSource: null, ...over,
});

describe("what an import saves (preview = confirm)", () => {
  const parsed = parsedFixture("foreflight-style.csv");

  it("add mode keeps the logbook and reports flights that are already in it instead of double-counting", () => {
    const plan = planImport(parsed, [existing({ externalSource: "myflightbook", source: "IMPORTED" })], "add", false);
    assert.equal(plan.toSave.length, 3);
    assert.equal(plan.alreadyInLogbook.length, 1);
    assert.equal(plan.alreadyInLogbook[0].existingSource, "MyFlightbook");
    assert.equal(plan.replacing, null);
    assert.equal(plan.saveTotals.hours.totalHours, 10, "11.4 in the file minus the 1.4 already there");
  });

  it("add mode never deletes: an earlier import's matching flight is reported, not replaced", () => {
    const plan = planImport(parsed, [existing({ source: "IMPORTED" })], "add", false);
    assert.equal(plan.alreadyInLogbook.length, 1);
    assert.equal(plan.alreadyInLogbook[0].existingSource, "an earlier import");
  });

  it("replace mode states exactly what it removes, and only previous CSV/scan imports", () => {
    const old = [existing({ source: "IMPORTED", totalHours: "2.5", date: new Date("2025-01-01T00:00:00Z") }), existing({ source: "IMPORTED", totalHours: "1.4" })];
    const kept = [existing({ source: "MANUAL", date: new Date("2025-06-01T00:00:00Z") }), existing({ source: "PLATFORM", date: new Date("2025-07-01T00:00:00Z") }), existing({ source: "IMPORTED", externalSource: "myflightbook", date: new Date("2025-08-01T00:00:00Z") })];
    const plan = planImport(parsed, [...old, ...kept], "replace", false);
    assert.equal(plan.replacing?.flights, 2);
    assert.equal(plan.replacing?.totals.hours.totalHours, 3.9);
    assert.equal(plan.toSave.length, 4, "the old import's copy doesn't block re-importing it");
  });

  it("duplicates are only imported when the pilot chooses to", () => {
    const messy = parsedFixture("messy-rows.csv");
    assert.equal(planImport(messy, [], "add", false).duplicatesInFile.length, 1);
    const keep = planImport(messy, [], "add", true);
    assert.equal(keep.duplicatesInFile.length, 0);
    assert.equal(keep.toSave.length, messy.flights.length + 1);
  });

  it("totals of what's saved add up exactly to the rows saved", () => {
    const plan = planImport(parsedFixture("hhmm-durations.csv"), [], "add", false);
    assert.deepEqual(plan.saveTotals, importTotals(plan.toSave));
  });
});

describe("full logbook export", () => {
  const entry = (over: Partial<ExportEntry>): ExportEntry => ({
    date: new Date("2026-03-02T00:00:00Z"), departureIcao: "FALA", arrivalIcao: "FAPM", aircraftType: "R44", aircraftReg: "ZS-HLA", totalHours: "1.2500", picHours: "1.2500",
    coPilotHours: null, dualHours: null, instructorHours: null, nightHours: "0.3333", instrumentHours: null, multiEngineHours: null, turbineHours: null,
    dayLandings: 2, nightLandings: 1, certifier: null, remarks: 'Gusty, "fun"', source: "MANUAL", externalSource: null, verified: false, ...over,
  });

  it("round-trips through our own importer without changing a single hour", () => {
    const entries = [
      entry({}),
      entry({ date: new Date("2026-03-05T00:00:00Z"), totalHours: "1.3333", picHours: null, remarks: "line one\nline two", source: "IMPORTED", externalSource: "myflightbook" }),
      entry({ date: new Date("2026-04-01T00:00:00Z"), totalHours: "4.35", nightHours: null, source: "PLATFORM", verified: true, remarks: null }),
    ];
    const csv = buildLogbookCsv(entries, { asOf: new Date("2026-01-01T00:00:00Z"), totalHours: "1234.5", picHours: "1100" });
    const back = parseLogbookFile(new TextEncoder().encode(csv), { today: TODAY });
    assert.equal(back.ok, true, back.error);
    assert.deepEqual(back.flights.map((f) => f.totalHours), [1.25, 1.3333, 4.35]);
    assert.deepEqual(back.flights.map((f) => f.nightHours), [0.3333, 0.3333, null]);
    assert.equal(back.flights[0].remarks, 'Gusty, "fun"');
    assert.equal(back.flights[1].remarks, "line one\nline two");
    assert.deepEqual(back.flights.map((f) => [f.dayLandings, f.nightLandings]), [[2, 1], [2, 1], [2, 1]]);
    // The opening balance row is reported as a brought-forward line, never imported as a 1234.5-hour flight.
    assert.equal(back.skipped.length, 1);
    assert.match(back.skipped[0].reason, /brought-forward/);
    assert.deepEqual(back.ignoredColumns, ["Source", "Verified"]);
  });

  it("labels every source and includes every flight", () => {
    const csv = buildLogbookCsv([entry({ source: "PLATFORM", verified: true }), entry({ externalSource: "myflightbook", source: "IMPORTED" })], null);
    assert.match(csv, /Lumiritin flight,yes/);
    assert.match(csv, /MyFlightbook,no/);
    assert.equal(csv.trim().split("\r\n").length, 3);
  });

  it("is safe to open in a spreadsheet (no formula injection) and exact", () => {
    assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
    assert.equal(csvCell("+27 82"), "'+27 82");
    assert.equal(hoursText("1.2500"), "1.25");
    assert.equal(hoursText("1.0000"), "1");
    assert.equal(hoursText(null), "");
  });
});
