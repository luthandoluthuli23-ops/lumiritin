import "server-only";
import type { FlightLogEntry, LogbookSummary, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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

/**
 * Recency from logged landings. Honest and simple: it only knows about landings the pilot has logged. Entries are dated
 * at UTC midnight, so the 90-day window starts at the UTC midnight 90 days ago (a landing exactly 90 days ago still
 * counts for the whole of that day), and flights dated in the future never count.
 */
export function computeCurrency(entries: Pick<FlightLogEntry, "date" | "dayLandings" | "nightLandings">[], now = new Date()): Currency {
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 90 * 86_400_000);
  const recent = entries
    .filter((e) => e.date >= windowStart && e.date <= now)
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
 * Only flights that have already ended are logged: a booked-but-not-yet-flown duty uses planned hours and must not
 * inflate totals or passenger recency, so any such row created earlier is removed until the flight is over.
 */
export async function syncPlatformFlights(personId: string): Promise<number> {
  const now = new Date();
  const upcoming = await db.crewRequest.findMany({
    where: { assignedPersonId: personId, status: "FILLED", endsAt: { gt: now } },
    select: { id: true },
  });
  if (upcoming.length > 0) {
    await db.flightLogEntry.deleteMany({ where: { personId, source: "PLATFORM", crewRequestId: { in: upcoming.map((r) => r.id) } } });
  }

  const filled = await db.crewRequest.findMany({
    where: { assignedPersonId: personId, status: { in: ["FILLED"] }, endsAt: { lte: now } },
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

// CSV import lives in lib/logbook-csv.ts (parsing) and lib/logbook-import.ts (what gets saved); export in lib/logbook-export.ts.
