// Minimal iCalendar (RFC 5545) reader: just enough to turn a pilot's external calendar into blocked time.
// Only start/end times are kept. Event titles, locations and attendees are deliberately discarded (privacy).

export interface IcalEvent {
  uid: string;
  start: Date;
  end: Date;
}

export interface IcalResult {
  events: IcalEvent[];
  skipped: {
    /** Events with RRULE. Recurrence expansion is not implemented, so these are NOT blocked. */
    recurring: number;
    /** Events in a time zone other than UTC or Africa/Johannesburg. */
    unsupportedZone: number;
    /** Cancelled events and events marked "free" (TRANSP:TRANSPARENT) never block time. */
    notBusy: number;
    invalid: number;
  };
}

const SAST_OFFSET = "+02:00";

/** Undo RFC 5545 line folding: a line starting with a space or tab continues the previous one. */
const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, "");

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

type Parsed = { date: Date; allDay: boolean } | "unsupported" | null;

/** Parses a DTSTART/DTEND value. Floating times (no zone) are interpreted as SAST. */
function parseDate(p: Prop): Parsed {
  const v = p.value;
  const tzid = p.params.TZID;

  if (p.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    return m ? { date: new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00${SAST_OFFSET}`), allDay: true } : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7] === "Z") return { date: new Date(`${iso}Z`), allDay: false };
  if (!tzid || tzid === "Africa/Johannesburg" || tzid === "South Africa Standard Time") return { date: new Date(`${iso}${SAST_OFFSET}`), allDay: false };
  if (tzid === "UTC" || tzid === "GMT") return { date: new Date(`${iso}Z`), allDay: false };
  return "unsupported";
}

/** "PT1H30M" / "P1D" → milliseconds, or null if unparseable. */
function parseDuration(v: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
  if (!m) return null;
  const [, w = "0", d = "0", h = "0", min = "0", s = "0"] = m;
  return ((+w * 7 + +d) * 86_400 + +h * 3_600 + +min * 60 + +s) * 1000;
}

export function parseIcal(text: string): IcalResult {
  const result: IcalResult = { events: [], skipped: { recurring: 0, unsupportedZone: 0, notBusy: 0, invalid: 0 } };
  const lines = unfold(text).split(/\r?\n/);

  let inEvent = false;
  let props: Prop[] = [];

  const finish = () => {
    const get = (n: string) => props.find((p) => p.name === n);
    const status = get("STATUS")?.value.toUpperCase();
    if (status === "CANCELLED" || get("TRANSP")?.value.toUpperCase() === "TRANSPARENT") return void result.skipped.notBusy++;
    if (get("RRULE") || get("RDATE")) return void result.skipped.recurring++;

    const startProp = get("DTSTART");
    if (!startProp) return void result.skipped.invalid++;
    const start = parseDate(startProp);
    if (start === "unsupported") return void result.skipped.unsupportedZone++;
    if (!start) return void result.skipped.invalid++;

    let end: Date | null = null;
    const endProp = get("DTEND");
    const durProp = get("DURATION");
    if (endProp) {
      const e = parseDate(endProp);
      if (e === "unsupported") return void result.skipped.unsupportedZone++;
      end = e ? e.date : null;
    } else if (durProp) {
      const ms = parseDuration(durProp.value);
      end = ms === null ? null : new Date(start.date.getTime() + ms);
    } else {
      end = new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 3_600_000));
    }
    if (!end || end.getTime() <= start.date.getTime()) return void result.skipped.invalid++;

    result.events.push({ uid: get("UID")?.value ?? `${start.date.getTime()}`, start: start.date, end });
  };

  for (const line of lines) {
    const t = line.trim().toUpperCase();
    if (t === "BEGIN:VEVENT") {
      inEvent = true;
      props = [];
    } else if (t === "END:VEVENT") {
      if (inEvent) finish();
      inEvent = false;
    } else if (inEvent) {
      const p = parseLine(line);
      if (p) props.push(p);
    }
  }
  return result;
}

/** Events that overlap [from, to), soonest first, capped so a huge feed cannot flood the database. */
export function eventsInRange(events: readonly IcalEvent[], from: Date, to: Date, cap = 500): IcalEvent[] {
  return events
    .filter((e) => e.start < to && e.end > from)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, cap);
}
