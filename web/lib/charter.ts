// Charter classes and the indicative price estimate. Pure: the browser uses it for the live quote and the
// API re-runs it server-side, so a client can never choose its own price.
import { distanceNm, type Coordinates } from "@/lib/geo";

export type AircraftClassId = "LIGHT_HELI" | "MEDIUM_HELI" | "HEAVY_HELI";

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

// Pax / cruise / range are typical figures for the class of helicopter, not for any one aircraft.
export const AIRCRAFT_CLASSES: readonly AircraftClassSpec[] = [
  { id: "LIGHT_HELI", label: "Light Helicopter", examples: "Airbus H125, Robinson R66", maxPax: 5, cruiseKts: 120, rangeNm: 340, hourlyRateZar: 20_000 },
  { id: "MEDIUM_HELI", label: "Medium Helicopter", examples: "Airbus H145, Bell 429", maxPax: 8, cruiseKts: 135, rangeNm: 400, hourlyRateZar: 35_000 },
  { id: "HEAVY_HELI", label: "Heavy Helicopter", examples: "Leonardo AW139, Airbus H175", maxPax: 12, cruiseKts: 150, rangeNm: 480, hourlyRateZar: 60_000 },
];

export const aircraftClass = (id: string): AircraftClassSpec | undefined => AIRCRAFT_CLASSES.find((c) => c.id === id);

// Rough class for common helicopter ICAO type designators, used only to pick a cruise speed for price suggestions.
const CLASS_BY_TYPE: Record<string, AircraftClassId> = {
  R66: "LIGHT_HELI",
  R44: "LIGHT_HELI",
  AS50: "LIGHT_HELI", // AS350 / H125
  H125: "LIGHT_HELI",
  EC30: "LIGHT_HELI", // EC130 / H130
  B06: "LIGHT_HELI", // Bell 206
  H145: "MEDIUM_HELI",
  EC45: "MEDIUM_HELI",
  B429: "MEDIUM_HELI",
  B412: "MEDIUM_HELI",
  A139: "HEAVY_HELI", // AW139
  H175: "HEAVY_HELI",
  S76: "HEAVY_HELI",
};
/** Class for a helicopter ICAO type designator, defaulting to Medium Helicopter when we do not recognise it. */
export const classForType = (designator: string): AircraftClassSpec => aircraftClass(CLASS_BY_TYPE[designator] ?? "MEDIUM_HELI")!;

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
