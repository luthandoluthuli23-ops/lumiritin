// One date format for the pilot portal ("8 Nov 2026" / "8 Nov 2026, 19:42"), always in South African time.
// Built from numeric Intl parts rather than a locale pattern, so the server render and the browser render are identical
// (locale data differs between Node and browsers, which is what causes hydration mismatches).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SAST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(value: Date | string) {
  const p = Object.fromEntries(SAST.formatToParts(typeof value === "string" ? new Date(value) : value).map((x) => [x.type, x.value]));
  return { day: Number(p.day), month: MONTHS[Number(p.month) - 1], year: p.year, hour: p.hour, minute: p.minute };
}

/** "8 Nov 2026". A bare "YYYY-MM-DD" is a calendar date and is shown as written, with no time-zone shift. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const m = DATE_ONLY.exec(value);
    if (m) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }
  const p = parts(value);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "8 Nov 2026, 19:42" in South African time. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const p = parts(value);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
}
