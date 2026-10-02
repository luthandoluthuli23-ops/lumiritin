// Charter classes and the indicative price estimate. Pure: the browser uses it for the live quote and the
// API re-runs it server-side, so a client can never choose its own price.
import { distanceNm, type Coordinates } from "@/lib/geo";

export type AircraftClassId = "VERY_LIGHT_JET" | "LIGHT_JET" | "MIDSIZE_JET" | "HEAVY_JET" | "TURBOPROP";

export interface AircraftClassSpec {
  id: AircraftClassId;
  label: string;
  examples: string;
  maxPax: number;
  cruiseKts: number;
  rangeNm: number;
  /**
   * PLACEHOLDER hourly rate in whole ZAR. These are not market data: replace with operator-supplied rates
   * (Aircraft.hourlyRateZar) before showing quotes to real customers.
   */
  hourlyRateZar: number;
}

// Pax / cruise / range are typical figures for the class, not for any one aircraft.
export const AIRCRAFT_CLASSES: readonly AircraftClassSpec[] = [
  { id: "TURBOPROP", label: "Turboprop", examples: "Pilatus PC-12, King Air 350", maxPax: 8, cruiseKts: 270, rangeNm: 1500, hourlyRateZar: 25_000 },
  { id: "VERY_LIGHT_JET", label: "Very Light Jet", examples: "Phenom 100, Citation M2", maxPax: 4, cruiseKts: 350, rangeNm: 1100, hourlyRateZar: 30_000 },
  { id: "LIGHT_JET", label: "Light Jet", examples: "Phenom 300, Citation CJ3", maxPax: 6, cruiseKts: 420, rangeNm: 1800, hourlyRateZar: 40_000 },
  { id: "MIDSIZE_JET", label: "Midsize Jet", examples: "Citation Latitude, Learjet 60", maxPax: 8, cruiseKts: 440, rangeNm: 2500, hourlyRateZar: 55_000 },
  { id: "HEAVY_JET", label: "Heavy Jet", examples: "Gulfstream G450, Falcon 900", maxPax: 12, cruiseKts: 480, rangeNm: 4000, hourlyRateZar: 90_000 },
];

export const aircraftClass = (id: string): AircraftClassSpec | undefined => AIRCRAFT_CLASSES.find((c) => c.id === id);

// Rough class for common ICAO type designators, used only to pick a cruise speed for price suggestions.
const CLASS_BY_TYPE: Record<string, AircraftClassId> = {
  E50P: "VERY_LIGHT_JET",
  C525: "LIGHT_JET",
  C25B: "LIGHT_JET",
  E55P: "LIGHT_JET",
  C56X: "MIDSIZE_JET",
  C680: "MIDSIZE_JET",
  LJ45: "MIDSIZE_JET",
  GLF4: "HEAVY_JET",
  FA7X: "HEAVY_JET",
  PC12: "TURBOPROP",
  BE20: "TURBOPROP",
};
/** Class for an ICAO type designator, defaulting to Light Jet when we do not recognise it. */
export const classForType = (designator: string): AircraftClassSpec => aircraftClass(CLASS_BY_TYPE[designator] ?? "LIGHT_JET")!;

/** Allowance added to every leg for taxi, climb and approach. An assumption, not a measurement. */
export const LEG_OVERHEAD_HOURS = 0.3;
/** A leg is never billed for less than this many hours. */
export const MIN_BILLED_HOURS_PER_LEG = 1;
/** Estimates are rounded to the nearest R100. */
const ROUND_TO_ZAR = 100;

export interface LegQuote {
  distanceNm: number;
  billedHours: number;
}

export interface Quote {
  legs: LegQuote[];
  totalDistanceNm: number;
  totalBilledHours: number;
  priceZar: number;
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: "range_exceeded" | "too_many_passengers"; detail: string };

/** Distance in whole nautical miles between two airfields. */
export const legDistanceNm = (a: Coordinates, b: Coordinates): number => Math.round(distanceNm(a, b));

export function computeQuote(distancesNm: readonly number[], spec: AircraftClassSpec, passengers: number): QuoteResult {
  if (passengers > spec.maxPax) {
    return { ok: false, reason: "too_many_passengers", detail: `${spec.label} seats up to ${spec.maxPax}` };
  }
  const longest = Math.max(0, ...distancesNm);
  if (longest > spec.rangeNm) {
    return { ok: false, reason: "range_exceeded", detail: `A ${longest} nm leg exceeds the ${spec.rangeNm} nm range of a ${spec.label}` };
  }

  const legs = distancesNm.map((nm) => ({
    distanceNm: nm,
    billedHours: Math.max(MIN_BILLED_HOURS_PER_LEG, nm / spec.cruiseKts + LEG_OVERHEAD_HOURS),
  }));
  const totalBilledHours = legs.reduce((s, l) => s + l.billedHours, 0);
  const priceZar = Math.round((totalBilledHours * spec.hourlyRateZar) / ROUND_TO_ZAR) * ROUND_TO_ZAR;

  return {
    ok: true,
    quote: {
      legs: legs.map((l) => ({ ...l, billedHours: Math.round(l.billedHours * 100) / 100 })),
      totalDistanceNm: distancesNm.reduce((s, n) => s + n, 0),
      totalBilledHours: Math.round(totalBilledHours * 100) / 100,
      priceZar,
    },
  };
}

export const MAX_MULTI_LEGS = 6;
