import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { LumiFlightRow } from "@/lib/lumi";

// ── Provider bridges ─────────────────────────────────────────────────────────
// A "connect" bridge pulls a pilot's flights from a third-party logbook over OAuth2, so nothing is uploaded.
// Only MyFlightbook publishes a usable pull API today (ForeFlight/LogTen are export-only — those go through the
// Lumi/CSV import instead). Endpoints come from env so they're set from the real app registration, never guessed.

export interface ProviderConfig {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  apiUrl: string;
  scope: string;
}

function myflightbook(): ProviderConfig | null {
  const clientId = process.env.MYFLIGHTBOOK_CLIENT_ID;
  const clientSecret = process.env.MYFLIGHTBOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    id: "myflightbook",
    name: "MyFlightbook",
    clientId,
    clientSecret,
    authUrl: process.env.MYFLIGHTBOOK_AUTH_URL ?? "https://myflightbook.com/logbook/public/oauthtoken.aspx",
    tokenUrl: process.env.MYFLIGHTBOOK_TOKEN_URL ?? "https://myflightbook.com/logbook/public/oauthtoken.aspx",
    apiUrl: process.env.MYFLIGHTBOOK_API_URL ?? "https://myflightbook.com/logbook/public/WebService.asmx",
    scope: process.env.MYFLIGHTBOOK_SCOPE ?? "currency totals addflight readflight",
  };
}

const PROVIDERS: Record<string, () => ProviderConfig | null> = { myflightbook };

export function getProvider(id: string): ProviderConfig | null {
  return PROVIDERS[id]?.() ?? null;
}
export function providerConfigured(id: string): boolean {
  return getProvider(id) != null;
}

export function redirectUri(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/api/logbook/connect/${id}/callback`;
}

// ── Signed state (CSRF + ties the callback back to the signed-in pilot) ──────

const secret = () => process.env.SESSION_SECRET ?? "dev-secret";

export function signState(personId: string, providerId: string): string {
  const payload = Buffer.from(JSON.stringify({ p: personId, v: providerId, t: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyState(state: string, personId: string, providerId: string): boolean {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { p, v, t } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { p: string; v: string; t: number };
    return p === personId && v === providerId && Date.now() - t < 15 * 60_000;
  } catch {
    return false;
  }
}

// ── Token exchange + flight fetch ────────────────────────────────────────────

export async function exchangeCode(cfg: ProviderConfig, code: string, redirect: string): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  try {
    const res = await fetch(cfg.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[connect.${cfg.id}] token HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    // Token endpoints return JSON or form-encoded; handle both.
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      return (j.access_token as string) ?? null;
    } catch {
      return new URLSearchParams(text).get("access_token");
    }
  } catch (err) {
    console.error(`[connect.${cfg.id}] token error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v);
    if (Number.isFinite(x)) return x;
  }
  return null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** Map one MyFlightbook LogbookEntry JSON object to our normalized flight row. Field names per their web service. */
function mapMyFlightbookFlight(f: Record<string, unknown>): LumiFlightRow {
  const route = str(f.Route) ?? "";
  const legs = route.split(/[\s\-–>]+/).filter(Boolean);
  return {
    date: isoDate(f.Date),
    from: legs[0] ?? null,
    to: legs.length > 1 ? legs[legs.length - 1] : null,
    aircraftType: str(f.ModelDisplay) ?? str(f.ModelName) ?? str(f.CatClassDisplay),
    aircraftReg: str(f.TailNumDisplay) ?? str(f.TailNumber),
    total: num(f.TotalFlightTime),
    pic: num(f.PIC),
    coPilot: num(f.SIC),
    dual: num(f.Dual),
    instructor: num(f.CFI),
    night: num(f.Nighttime),
    instrument: num(f.IMC) != null || num(f.SimulatedIFR) != null ? (num(f.IMC) ?? 0) + (num(f.SimulatedIFR) ?? 0) : null,
    multi: null, // MyFlightbook carries this as an aircraft attribute, not per-flight
    turbine: null,
    dayLandings: num(f.FullStopLandings) ?? num(f.Landings),
    nightLandings: num(f.NightLandings),
    certifier: null,
    remarks: str(f.Comment),
  };
}

/** Pull every flight for the authorized MyFlightbook user. Paginates. Returns normalized rows (never throws). */
export async function fetchMyFlightbookFlights(cfg: ProviderConfig, accessToken: string): Promise<{ ok: boolean; flights: LumiFlightRow[]; error?: string }> {
  const all: LumiFlightRow[] = [];
  const pageSize = 200;
  try {
    for (let offset = 0; offset < 10_000; offset += pageSize) {
      const res = await fetch(`${cfg.apiUrl}/FlightsWithQueryAndOffset`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ szAuthToken: accessToken, maxCount: pageSize, offset, fq: {} }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, flights: all, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
      let arr: unknown;
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        arr = Array.isArray(j) ? j : (j.d ?? j.Result ?? j.result);
      } catch {
        return { ok: false, flights: all, error: "Unexpected (non-JSON) response from MyFlightbook." };
      }
      const page = Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
      for (const f of page) all.push(mapMyFlightbookFlight(f));
      if (page.length < pageSize) break;
    }
    return { ok: true, flights: all.filter((f) => f.date && f.total != null && f.total > 0) };
  } catch (err) {
    return { ok: false, flights: all, error: err instanceof Error ? err.message : String(err) };
  }
}
