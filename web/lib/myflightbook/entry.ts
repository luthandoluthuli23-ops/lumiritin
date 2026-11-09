/**
 * Pure mapping from a normalised MyFlightbook flight to a `FlightLogEntry` row, plus the fingerprint used to decide
 * whether an already-imported row needs updating. No database access here (see lib/logbook-sync.ts).
 */
import type { MfbFlight } from "./client";

export const MFB_SOURCE = "myflightbook";

/** The columns an import writes (everything else keeps its default). */
export interface ImportedEntryData {
  personId: string;
  date: Date;
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
  dayLandings: number;
  nightLandings: number;
  source: "IMPORTED";
  verified: false;
  externalSource: typeof MFB_SOURCE;
  externalId: string;
}

// MyFlightbook's Route is free text ("FALA FAPM FALA", "FAGC-FAPE", "FALA direct Hoedspruit"). Keep only tokens that
// look like airfield codes; everything else is dropped rather than stored as a bogus ICAO.
const NOT_AIRFIELDS = new Set(["DCT", "VFR", "IFR", "VIA", "THE", "AND", "TO"]);
const looksLikeAirfield = (t: string) => /^[A-Z][A-Z0-9]{2,3}$/.test(t) && !NOT_AIRFIELDS.has(t);

export function routeToAirfields(route: string | null): { from: string | null; to: string | null } {
  const legs = (route ?? "")
    .toUpperCase()
    .split(/[\s\-–—>,/]+/)
    .filter(looksLikeAirfield);
  return { from: legs[0] ?? null, to: legs.length > 1 ? legs[legs.length - 1] : null };
}

/** 0 means "none" in MyFlightbook; the logbook stores "not recorded" as null (same as the CSV import). */
const hours = (x: number): number | null => (x > 0 ? x : null);

export function toEntryData(personId: string, f: MfbFlight): ImportedEntryData {
  const { from, to } = routeToAirfields(f.route);
  return {
    personId,
    date: new Date(`${f.date}T00:00:00.000Z`),
    departureIcao: from,
    arrivalIcao: to,
    aircraftType: f.aircraftModel?.slice(0, 16) ?? null,
    aircraftReg: f.tailNumber?.slice(0, 16) ?? null,
    totalHours: f.total,
    picHours: hours(f.pic),
    coPilotHours: hours(f.sic),
    dualHours: hours(f.dual),
    instructorHours: hours(f.instructor),
    nightHours: hours(f.night),
    instrumentHours: hours(f.instrument),
    dayLandings: Math.max(0, f.landings - f.nightLandings),
    nightLandings: f.nightLandings,
    source: "IMPORTED",
    verified: false,
    externalSource: MFB_SOURCE,
    externalId: f.externalId,
  };
}

type Num = number | { toString(): string } | null | undefined;
const n = (v: Num): number | null => (v == null ? null : Number(v));
const d = (v: Date | string) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export interface FingerprintInput {
  date: Date | string;
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftType: string | null;
  aircraftReg: string | null;
  totalHours: Num;
  picHours: Num;
  coPilotHours: Num;
  dualHours: Num;
  instructorHours: Num;
  nightHours: Num;
  instrumentHours: Num;
  dayLandings: number;
  nightLandings: number;
}

/** Equal fingerprints mean the stored row already matches MyFlightbook, so a re-sync can skip the write. */
export function fingerprint(e: FingerprintInput): string {
  return JSON.stringify([
    d(e.date),
    e.departureIcao,
    e.arrivalIcao,
    e.aircraftType,
    e.aircraftReg,
    n(e.totalHours),
    n(e.picHours),
    n(e.coPilotHours),
    n(e.dualHours),
    n(e.instructorHours),
    n(e.nightHours),
    n(e.instrumentHours),
    e.dayLandings,
    e.nightLandings,
  ]);
}
