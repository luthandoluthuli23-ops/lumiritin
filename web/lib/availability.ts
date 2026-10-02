// Pilot availability state machine. Pure and deterministic: no database, no clock except the `now` you pass in.
//
//   A pilot's state for a requested time range is derived from their stored windows:
//     BOOKED    any BOOKED window overlaps the range (accepted job, operator-marked flight, or external calendar)
//     AVAILABLE a single continuous run of unexpired AVAILABLE windows covers the whole range
//     OFF       everything else
//
//   OFF is never stored. "Available until Friday 18:00" is a window whose endsAt is that expiry; once it passes
//   the pilot is OFF automatically. Nothing has to run for the expiry to happen, so it cannot go stale.
//   BOOKED always wins over AVAILABLE.

export type PilotState = "AVAILABLE" | "BOOKED" | "OFF";

export interface AvailabilityWindow {
  state: "AVAILABLE" | "BOOKED";
  startsAt: Date;
  endsAt: Date;
}

/** An AVAILABLE window may not run longer than this, so availability has to be actively renewed. */
export const MAX_AVAILABLE_HOURS = 7 * 24;

export interface StateResult {
  state: PilotState;
  /** AVAILABLE: when the availability that covers the range expires. BOOKED: when the blocking window ends. */
  until: Date | null;
  /** Plain-language explanation, safe to show to the pilot or an operator. */
  reason: string;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart;

/** Merges touching or overlapping intervals so two back-to-back windows count as one continuous run. */
function merge(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * State over [from, to). Pass from === to to ask about a single instant ("right now").
 * An AVAILABLE window that has already ended (endsAt <= now) is ignored: that is the auto-expiry.
 */
export function resolveState(windows: readonly AvailabilityWindow[], from: Date, to: Date = from, now: Date = new Date()): StateResult {
  const f = from.getTime();
  // An instant is treated as a 1 ms range so the same overlap test works for both.
  const t = Math.max(to.getTime(), f + 1);
  const nowMs = now.getTime();

  const blocking = windows.filter((w) => w.state === "BOOKED" && overlaps(f, t, w.startsAt.getTime(), w.endsAt.getTime()));
  if (blocking.length > 0) {
    const end = new Date(Math.max(...blocking.map((w) => w.endsAt.getTime())));
    return { state: "BOOKED", until: end, reason: "Already booked or blocked for part of this period" };
  }

  const live = windows.filter((w) => w.state === "AVAILABLE" && w.endsAt.getTime() > nowMs);
  const run = merge(live.map((w) => [w.startsAt.getTime(), w.endsAt.getTime()] as [number, number])).find(([s, e]) => s <= f && e >= t);
  if (run) return { state: "AVAILABLE", until: new Date(run[1]), reason: "Marked available for this whole period" };

  const hadExpired = windows.some((w) => w.state === "AVAILABLE" && w.endsAt.getTime() <= nowMs && w.endsAt.getTime() >= f);
  return {
    state: "OFF",
    until: null,
    reason: hadExpired ? "Availability expired and was not renewed" : "Not marked available for this period",
  };
}

/** Right-now state, e.g. for the pilot's own dashboard. */
export const currentState = (windows: readonly AvailabilityWindow[], now: Date = new Date()): StateResult => resolveState(windows, now, now, now);

/** Returns a problem with a proposed AVAILABLE window, or null if it is acceptable. */
export function validateAvailableWindow(startsAt: Date, endsAt: Date, now: Date = new Date()): string | null {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return "Invalid date.";
  if (endsAt.getTime() <= now.getTime()) return "The expiry must be in the future.";
  if (endsAt.getTime() <= startsAt.getTime()) return "The expiry must be after the start.";
  const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  if (hours > MAX_AVAILABLE_HOURS) return `Availability can be set for at most ${MAX_AVAILABLE_HOURS / 24} days at a time. Renew it when it runs out.`;
  return null;
}

/** "Available until Fri 18:00" style label, in SAST. */
export function describeState(r: StateResult): string {
  const fmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  if (r.state === "AVAILABLE" && r.until) return `Available until ${fmt.format(r.until)}`;
  if (r.state === "BOOKED") return r.until ? `Booked until ${fmt.format(r.until)}` : "Booked";
  return "Off";
}
