import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyIcs, syncFromSavedUrl } from "@/lib/calendar-sync";
import { assertPublicHttpsUrl, fetchPublicText, UnsafeUrlError } from "@/lib/safe-fetch";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const maxDuration = 30;

const schema = z.union([
  /** A public https:// (or webcal://) iCal feed URL, e.g. Google Calendar's "secret address in iCal format". */
  z.object({ url: z.string().trim().min(8).max(2000) }),
  /** Or the raw contents of an .ics file, for calendars that cannot be shared by link. */
  z.object({ ics: z.string().min(20).max(1_000_000) }),
  z.object({ resync: z.literal(true) }),
]);

const fail = (status: number, error: string, message?: string) => NextResponse.json({ error, message }, { status });

/** GET — connection status. Never returns the feed URL itself (it can contain a secret). */
export async function GET() {
  const personId = await getPilotPersonId();
  if (!personId) return fail(403, "forbidden");
  const p = await db.person.findUniqueOrThrow({ where: { id: personId }, select: { icalUrl: true, icalSyncedAt: true, icalLastError: true } });
  const blocked = await db.availability.count({ where: { personId, source: "ICAL" } });
  let host: string | null = null;
  try {
    host = p.icalUrl ? new URL(p.icalUrl.replace(/^webcal:\/\//i, "https://")).hostname : null;
  } catch {}
  return NextResponse.json({ connected: Boolean(p.icalUrl), host, syncedAt: p.icalSyncedAt, lastError: p.icalLastError, blockedPeriods: blocked });
}

/**
 * POST — connect and import a calendar. Busy events become BOOKED windows so the pilot is not offered
 * jobs on days they already fly elsewhere. Re-posting (or { resync: true }) refreshes the import.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return fail(403, "forbidden");
  // 6 per 10 minutes in production (each one makes an outbound request); relaxed in development so tests can run.
  const max = process.env.NODE_ENV === "production" ? 6 : 500;
  if (isRateLimited(`ical:${personId}`, max, 10 * 60_000)) return fail(429, "rate_limited", "Too many syncs. Try again in a few minutes.");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, "validation_failed", "Send a calendar link, the contents of an .ics file, or { resync: true }.");
  const input = parsed.data;

  try {
    if ("ics" in input) {
      return NextResponse.json({ ok: true, ...(await applyIcs(personId, input.ics)) });
    }
    if ("url" in input) {
      await assertPublicHttpsUrl(input.url); // reject unsafe URLs before saving anything
      const summary = await applyIcs(personId, await fetchPublicText(input.url));
      await db.person.update({ where: { id: personId }, data: { icalUrl: input.url.trim() } }); // saved only after a successful import
      return NextResponse.json({ ok: true, ...summary });
    }
    const r = await syncFromSavedUrl(personId);
    return "error" in r ? fail(422, "sync_failed", r.error) : NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof UnsafeUrlError) return fail(422, "calendar_rejected", err.message);
    throw err;
  }
}

/** DELETE — disconnect and remove the imported blocks. */
export async function DELETE() {
  const personId = await getPilotPersonId();
  if (!personId) return fail(403, "forbidden");
  await db.$transaction([
    db.availability.deleteMany({ where: { personId, source: "ICAL" } }),
    db.person.update({ where: { id: personId }, data: { icalUrl: null, icalSyncedAt: null, icalLastError: null } }),
  ]);
  return NextResponse.json({ ok: true });
}
