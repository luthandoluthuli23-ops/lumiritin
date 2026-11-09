/**
 * MyFlightbook OAuth2 + resource client (confidential client, authorization-code flow). Pure: no database, no Next.
 *
 * Protocol (https://github.com/ericberman/MyFlightbookWeb/wiki/1.-Home and the server source):
 *  - Authorize (browser redirect): <authUrl>?client_id&redirect_uri&response_type=code&scope&state. Scopes are
 *    space-separated and must be a subset of those registered for the client.
 *  - Token (server-to-server POST, form-encoded): grant_type=authorization_code | refresh_token. A refresh request carries
 *    `refresh_token` and does NOT need `redirect_uri`.
 *  - Resource: POST <apiUrl>/<MethodName>?json=1 with the arguments as FORM FIELDS and the access token in an
 *    `Authorization: Bearer` header. The legacy `szAuthToken` argument is NOT sent: with OAuth it is ignored, and tokens
 *    from AuthTokenForUser etc. are not interchangeable with OAuth tokens.
 *  - FlightsWithQueryAndOffset(fq, offset, maxCount) returns LogbookEntry objects (FlightID, Date, Landings, ...).
 *
 * Not stated by the published docs, so handled defensively (check on the first real run): the token response's JSON
 * field names (standard OAuth2 names are assumed), the wire format of `Date` (ISO string, "/Date(ms)/" and epoch-ms are
 * all accepted), and any rate limit (pages are fetched one at a time with a short pause).
 */
import type { MfbConfig } from "./config";

export type FetchLike = typeof fetch;

export class MfbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MfbError";
  }
}

/** The access token was rejected (expired / revoked / bad grant): refresh it, or ask the pilot to reconnect. */
export class MfbAuthError extends MfbError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = "MfbAuthError";
  }
}

export interface MfbTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

/** One MyFlightbook flight, normalised. Hours are decimal hours rounded to 0.1; absent values are 0. */
export interface MfbFlight {
  /** MyFlightbook FlightID, as a string. Stable across syncs: the dedupe key. */
  externalId: string;
  /** Local date of the flight, YYYY-MM-DD. */
  date: string;
  route: string | null;
  tailNumber: string | null;
  aircraftModel: string | null;
  /** All landings (day + night). */
  landings: number;
  nightLandings: number;
  total: number;
  pic: number;
  sic: number;
  dual: number;
  instructor: number;
  night: number;
  /** IMC + simulated instrument. */
  instrument: number;
}

export type SkipReason = "no_id" | "no_date" | "no_time" | "too_long";
export type Normalized = { ok: true; flight: MfbFlight } | { ok: false; reason: SkipReason };

const TIMEOUT_MS = 30_000;
/** A single logbook row longer than this is almost certainly bad data (and the entry form caps hours at 24). */
const MAX_FLIGHT_HOURS = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Authorization + tokens
// ─────────────────────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(cfg: MfbConfig, redirectUri: string, state: string): string {
  const u = new URL(cfg.authUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  return u.toString();
}

export function exchangeCode(cfg: MfbConfig, code: string, redirectUri: string, fetchImpl: FetchLike = fetch): Promise<MfbTokens> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, null, fetchImpl);
}

export function refreshTokens(cfg: MfbConfig, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<MfbTokens> {
  // No redirect_uri on refresh. If the server doesn't rotate the refresh token, keep the one we already have.
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, refreshToken, fetchImpl);
}

async function tokenRequest(cfg: MfbConfig, params: Record<string, string>, fallbackRefresh: string | null, fetchImpl: FetchLike): Promise<MfbTokens> {
  const body = new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  // MyFlightbook returns the exception message as the 400 body. It never contains our credentials.
  if (!res.ok) throw new MfbAuthError(`MyFlightbook token request failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  return parseTokenResponse(text, fallbackRefresh);
}

export function parseTokenResponse(text: string, fallbackRefreshToken: string | null = null, now = new Date()): MfbTokens {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MfbError("MyFlightbook token response was not JSON");
  }
  const o = (json ?? {}) as Record<string, unknown>;
  const accessToken = typeof o.access_token === "string" ? o.access_token : "";
  if (!accessToken) {
    const why = typeof o.error_description === "string" ? o.error_description : typeof o.error === "string" ? o.error : "no access_token in response";
    throw new MfbAuthError(`MyFlightbook token response rejected: ${why}`);
  }
  const expiresIn = Number(o.expires_in);
  return {
    accessToken,
    refreshToken: typeof o.refresh_token === "string" && o.refresh_token ? o.refresh_token : fallbackRefreshToken,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now.getTime() + expiresIn * 1000) : null,
    scope: typeof o.scope === "string" ? o.scope : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource calls
// ─────────────────────────────────────────────────────────────────────────────

/** POST one API method. Arguments are form fields (JSON-encoded where the method takes an object). */
export async function callResource(
  cfg: MfbConfig,
  method: string,
  accessToken: string,
  args: Record<string, string | number>,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const res = await fetchImpl(`${cfg.apiUrl}/${encodeURIComponent(method)}?json=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)])),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new MfbAuthError(`MyFlightbook rejected the access token (${res.status})`, res.status);
  if (!res.ok) throw new MfbError(`MyFlightbook ${method} failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new MfbError(`MyFlightbook ${method} did not return JSON: ${text.slice(0, 100)}`, res.status);
  }
}

/** The list may come back as a bare array or wrapped in an object (`d`, `<Method>Result`). Anything else is an error, never "0 flights". */
export function unwrapRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    for (const v of Object.values(json as Record<string, unknown>)) if (Array.isArray(v)) return v;
  }
  throw new MfbError("Unexpected MyFlightbook flight list format");
}

export interface FetchAllOptions {
  pageSize?: number;
  maxPages?: number;
  pauseMs?: number;
  /** Called once per run with the first raw row, so the first real sign-in can be checked against the actual field names. */
  onSample?: (raw: Record<string, unknown>) => void;
}

export interface FetchAllResult {
  flights: MfbFlight[];
  skipped: Record<SkipReason, number>;
  skippedTotal: number;
  /** Rows the API returned (including skipped ones and duplicates). */
  rawCount: number;
  pages: number;
  /** True only if we reached the end of the logbook (a short page). False means a safety limit stopped us early. */
  complete: boolean;
}

/**
 * Walk the whole logbook, page by page. `getToken` returns the current access token; `onAuthError` is invoked once if a
 * page is rejected (the caller refreshes the token) and that page is retried; a second rejection propagates.
 */
export async function fetchAllFlights(
  cfg: MfbConfig,
  getToken: () => string,
  onAuthError: () => Promise<void>,
  fetchImpl: FetchLike = fetch,
  opts: FetchAllOptions = {},
): Promise<FetchAllResult> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 300; // 30,000 flights: a runaway guard, not an expected limit
  const pauseMs = opts.pauseMs ?? 250;
  const seen = new Set<string>();
  const flights: MfbFlight[] = [];
  const skipped: Record<SkipReason, number> = { no_id: 0, no_date: 0, no_time: 0, too_long: 0 };
  let rawCount = 0;
  let pages = 0;
  let complete = false;
  let sampled = false;

  for (let page = 0; page < maxPages; page++) {
    const args = { fq: "{}", offset: page * pageSize, maxCount: pageSize };
    let json: unknown;
    try {
      json = await callResource(cfg, "FlightsWithQueryAndOffset", getToken(), args, fetchImpl);
    } catch (e) {
      if (!(e instanceof MfbAuthError)) throw e;
      await onAuthError();
      json = await callResource(cfg, "FlightsWithQueryAndOffset", getToken(), args, fetchImpl);
    }
    const rows = unwrapRows(json);
    pages++;
    rawCount += rows.length;
    if (!sampled && rows[0] && typeof rows[0] === "object") {
      sampled = true;
      opts.onSample?.(rows[0] as Record<string, unknown>);
    }

    let fresh = 0;
    for (const row of rows) {
      const n = normalizeFlight(row);
      if (!n.ok) {
        skipped[n.reason]++;
        fresh++; // a skipped row still proves the server is advancing
        continue;
      }
      if (seen.has(n.flight.externalId)) continue;
      seen.add(n.flight.externalId);
      flights.push(n.flight);
      fresh++;
    }

    if (rows.length < pageSize) {
      complete = true; // short (or empty) page: that was the last one
      break;
    }
    // A full page that added nothing new means the server ignored our offset: stop instead of looping.
    if (fresh === 0) break;
    await new Promise((r) => setTimeout(r, pauseMs));
  }

  return { flights, skipped, skippedTotal: Object.values(skipped).reduce((a, b) => a + b, 0), rawCount, pages, complete };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

const round1 = (x: number) => Math.round(x * 10) / 10;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const count = (v: unknown) => Math.max(0, Math.trunc(num(v)));

/**
 * MyFlightbook `Date` is the *local* date of the flight, so it must never be shifted across time zones:
 *  - ISO strings: take the YYYY-MM-DD part as written.
 *  - "/Date(1712102400000)/" or epoch milliseconds: read the UTC date of that instant.
 */
export function parseMfbDate(v: unknown): string | null {
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const ms = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(v);
    if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString().slice(0, 10);
  return null;
}

/**
 * Landings: MyFlightbook's `Landings` is the total; `NightLandings` is the night share. We store them disjoint
 * (day = total - night) because the logbook's recency check adds day + night. If `Landings` is blank, fall back to
 * FullStopLandings + NightLandings. Verify this against the first real flight (set MYFLIGHTBOOK_DEBUG=1).
 */
function landings(r: Record<string, unknown>): { total: number; night: number } {
  const night = count(r.NightLandings);
  const explicit = count(r.Landings);
  const total = explicit > 0 ? explicit : count(r.FullStopLandings) + night;
  return { total, night: Math.min(night, total) };
}

/** Normalise one raw API row. Rows that can't be deduped, dated or timed are reported with a reason instead of vanishing. */
export function normalizeFlight(raw: unknown): Normalized {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "no_id" };
  const r = raw as Record<string, unknown>;
  const id = typeof r.FlightID === "number" || typeof r.FlightID === "string" ? String(r.FlightID).trim() : "";
  // FlightID 0 / -1 is how MyFlightbook marks an unsaved / new entry.
  if (!id || id === "0" || id === "-1") return { ok: false, reason: "no_id" };
  const date = parseMfbDate(r.Date);
  if (!date) return { ok: false, reason: "no_date" };
  const total = round1(num(r.TotalFlightTime));
  if (total <= 0) return { ok: false, reason: "no_time" };
  if (total > MAX_FLIGHT_HOURS) return { ok: false, reason: "too_long" };
  // A category can't exceed the flight's total time; clamp bad data instead of rejecting the whole flight.
  const part = (v: unknown) => Math.min(round1(Math.max(0, num(v))), total);
  const l = landings(r);
  return {
    ok: true,
    flight: {
      externalId: id,
      date,
      route: str(r.Route),
      tailNumber: str(r.TailNumDisplay),
      aircraftModel: str(r.ModelDisplay),
      landings: l.total,
      nightLandings: l.night,
      total,
      pic: part(r.PIC),
      sic: part(r.SIC),
      dual: part(r.Dual),
      instructor: part(r.CFI),
      night: part(r.Nighttime),
      instrument: Math.min(round1(Math.max(0, num(r.IMC)) + Math.max(0, num(r.SimulatedIFR))), total),
    },
  };
}
