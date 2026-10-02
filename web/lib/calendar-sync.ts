import { db } from "./db";
import { eventsInRange, parseIcal } from "./ical";
import { UnsafeUrlError, fetchPublicText } from "./safe-fetch";

const HORIZON_DAYS = 90;

export interface SyncSummary {
  imported: number;
  skipped: { recurring: number; unsupportedZone: number; notBusy: number; invalid: number };
}

/**
 * Replaces the pilot's ICAL-sourced BOOKED windows with the busy events in `icsText` (next 90 days).
 * Only event times are stored. The pilot's manual, booking and operator windows are never touched.
 */
export async function applyIcs(personId: string, icsText: string, now: Date = new Date()): Promise<SyncSummary> {
  if (!/BEGIN:VCALENDAR/i.test(icsText)) throw new UnsafeUrlError("That does not look like an iCalendar (.ics) feed.");
  const parsed = parseIcal(icsText);
  const events = eventsInRange(parsed.events, now, new Date(now.getTime() + HORIZON_DAYS * 86_400_000));

  await db.$transaction([
    db.availability.deleteMany({ where: { personId, source: "ICAL" } }),
    db.availability.createMany({
      data: events.map((e) => ({ personId, state: "BOOKED" as const, source: "ICAL" as const, startsAt: e.start, endsAt: e.end, note: "External calendar" })),
    }),
    db.person.update({ where: { id: personId }, data: { icalSyncedAt: now, icalLastError: null } }),
  ]);
  return { imported: events.length, skipped: parsed.skipped };
}

/** Fetches the pilot's saved feed and applies it. Records (never throws) a user-safe error on failure. */
export async function syncFromSavedUrl(personId: string): Promise<SyncSummary | { error: string }> {
  const person = await db.person.findUnique({ where: { id: personId }, select: { icalUrl: true } });
  if (!person?.icalUrl) return { error: "No calendar connected." };
  try {
    return await applyIcs(personId, await fetchPublicText(person.icalUrl));
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : "The calendar could not be read.";
    await db.person.update({ where: { id: personId }, data: { icalLastError: message } });
    return { error: message };
  }
}
