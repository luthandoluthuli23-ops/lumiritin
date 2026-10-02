// Pure types and helpers shared by server code and client components. Must not import Prisma.

/** Largest discount operators may advertise ("up to 75% off standard rates"). */
export const MAX_DISCOUNT_PERCENT = 75;

/** Statuses of bookings that hold seats. */
export const SEAT_HOLDING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export interface EmptyLegCard {
  id: string;
  originIcao: string;
  destinationIcao: string;
  departureStart: string; // ISO 8601
  departureEnd: string; // ISO 8601
  aircraftType: string; // ICAO designator, e.g. C525
  aircraftRegistration: string;
  operatorName: string;
  seatsOffered: number;
  remainingSeats: number;
  standardPricePerSeatZar: number;
  discountedPricePerSeatZar: number;
  discountPercent: number;
}

export const remainingSeats = (seatsOffered: number, bookedSeats: number): number =>
  Math.max(0, seatsOffered - bookedSeats);

export const discountPercent = (standard: number, discounted: number): number =>
  standard > 0 ? Math.round((1 - discounted / standard) * 100) : 0;

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});
export const formatZar = (amount: number): string => zar.format(amount).replace(/ /g, " ");

const TZ = "Africa/Johannesburg";

/** Calendar date (YYYY-MM-DD) of an instant in SAST, used for the date filter. */
export const sastDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

const dayFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** "Sat, 12 Oct · 08:00 – 12:00" (SAST). Spans two days if the window crosses midnight. */
export function formatWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = sastDate(startIso) === sastDate(endIso);
  return sameDay
    ? `${dayFmt.format(s)} · ${timeFmt.format(s)} – ${timeFmt.format(e)}`
    : `${dayFmt.format(s)} ${timeFmt.format(s)} – ${dayFmt.format(e)} ${timeFmt.format(e)}`;
}

const AIRCRAFT_NAMES: Record<string, string> = {
  C525: "Cessna Citation CJ",
  C25B: "Cessna Citation CJ3",
  C25C: "Cessna Citation CJ4",
  B350: "King Air 350",
  C56X: "Cessna Citation Excel",
  C680: "Cessna Citation Sovereign",
  E55P: "Embraer Phenom 300",
  E50P: "Embraer Phenom 100",
  PC12: "Pilatus PC-12",
  BE20: "King Air 200",
  LJ45: "Learjet 45",
  GLF4: "Gulfstream G450",
  FA7X: "Dassault Falcon 7X",
  B738: "Boeing 737-800",
};
export const aircraftName = (designator: string): string => AIRCRAFT_NAMES[designator] ?? designator;

/** Aircraft types offered in dropdowns, as [ICAO designator, display name], alphabetical by name. */
export const AIRCRAFT_TYPES: [string, string][] = Object.entries(AIRCRAFT_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
