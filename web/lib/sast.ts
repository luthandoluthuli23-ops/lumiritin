// South Africa has no daylight saving: SAST is always UTC+2.

/** "2026-10-12T08:00" (a <input type="datetime-local"> value, meant as SAST) → "2026-10-12T08:00:00+02:00". */
export function sastLocalToIso(local: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+02:00` : "";
}

/** Current time as a datetime-local value in SAST, for `min` attributes. */
export function nowSastLocal(): string {
  return new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 16);
}
