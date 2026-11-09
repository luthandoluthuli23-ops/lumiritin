import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret, signPayload, verifyPayload } from "../lib/myflightbook/crypto";
import { getMfbConfig, MFB_DEFAULT_URLS, type MfbConfig } from "../lib/myflightbook/config";
import {
  MfbAuthError,
  MfbError,
  buildAuthorizeUrl,
  callResource,
  exchangeCode,
  fetchAllFlights,
  normalizeFlight,
  parseMfbDate,
  parseTokenResponse,
  refreshTokens,
  unwrapRows,
  type FetchLike,
} from "../lib/myflightbook/client";
import { fingerprint, routeToAirfields, toEntryData, MFB_SOURCE } from "../lib/myflightbook/entry";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-1234567890";

const cfg: MfbConfig = {
  clientId: "lumiritin",
  clientSecret: "shh",
  authUrl: "https://mfb.test/logbook/mvc/oAuth/Authorize",
  tokenUrl: "https://mfb.test/logbook/mvc/oAuth/OAuthToken",
  apiUrl: "https://mfb.test/logbook/mvc/oAuth/OAuthResource",
  scope: "readflight",
};

/** A fake fetch that records every request and answers from a queue (or a function). */
function fakeFetch(responder: number | ((n: number, url: string, init: RequestInit) => { status: number; body: unknown }), body?: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = typeof responder === "number" ? { status: responder, body } : responder(calls.length - 1, String(url), init ?? {});
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  };
  return { impl, calls };
}
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);
const form = (init: RequestInit) => Object.fromEntries(new URLSearchParams(String(init.body)));

const flightRow = (id: number, extra: Record<string, unknown> = {}) => ({
  FlightID: id,
  Date: "2026-03-04T00:00:00",
  TotalFlightTime: 1.5,
  PIC: 1.5,
  Landings: 2,
  ...extra,
});

describe("crypto", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const blob = encryptSecret("access-token-123");
    assert.ok(!blob.includes("access-token-123"));
    assert.equal(decryptSecret(blob), "access-token-123");
  });
  it("uses a fresh IV each time and rejects tampering", () => {
    assert.notEqual(encryptSecret("x"), encryptSecret("x"));
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => decryptSecret(parts.join(".")));
  });
  it("refuses to run without a real SESSION_SECRET (no fallback key)", () => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "short";
    assert.throws(() => encryptSecret("x"), /SESSION_SECRET/);
    assert.throws(() => signPayload({ a: 1 }, 1000), /SESSION_SECRET/);
    delete process.env.SESSION_SECRET;
    assert.throws(() => encryptSecret("x"), /SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
  });
  it("verifies signed state, and rejects forgery, tampering and expiry", () => {
    const signed = signPayload({ v: "myflightbook", n: "abc" }, 60_000);
    assert.equal(verifyPayload<{ n: string }>(signed)?.n, "abc");
    const [, sig] = signed.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "myflightbook", n: "evil", exp: Date.now() + 60_000 })).toString("base64url");
    assert.equal(verifyPayload(`${forged}.${sig}`), null);
    assert.equal(verifyPayload(`${signed}x`), null);
    assert.equal(verifyPayload(signPayload({ n: "abc" }, -1)), null);
    assert.equal(verifyPayload(undefined), null);
    assert.equal(verifyPayload("garbage"), null);
  });
});

describe("config", () => {
  const base = { MYFLIGHTBOOK_CLIENT_ID: "id", MYFLIGHTBOOK_CLIENT_SECRET: "sec" } as unknown as NodeJS.ProcessEnv;
  it("is null until the client id and secret are set", () => {
    assert.equal(getMfbConfig({} as NodeJS.ProcessEnv), null);
    assert.equal(getMfbConfig({ MYFLIGHTBOOK_CLIENT_ID: "id" } as unknown as NodeJS.ProcessEnv), null);
  });
  it("defaults to the verified endpoints and the read-only scope", () => {
    const c = getMfbConfig(base)!;
    assert.equal(c.authUrl, MFB_DEFAULT_URLS.authUrl);
    assert.equal(c.tokenUrl, "https://myflightbook.com/logbook/mvc/oAuth/OAuthToken");
    assert.equal(c.apiUrl, "https://myflightbook.com/logbook/mvc/oAuth/OAuthResource");
    assert.equal(c.scope, "readflight");
  });
  it("normalises scope separators and trailing slashes", () => {
    const c = getMfbConfig({ ...base, MYFLIGHTBOOK_SCOPE: "readflight,totals", MYFLIGHTBOOK_API_URL: "https://x.test/api/" } as unknown as NodeJS.ProcessEnv)!;
    assert.equal(c.scope, "readflight totals");
    assert.equal(c.apiUrl, "https://x.test/api");
  });
  it("allows local http only outside production", () => {
    const local = { ...base, MYFLIGHTBOOK_TOKEN_URL: "http://127.0.0.1:4010/t" } as unknown as NodeJS.ProcessEnv;
    assert.equal(getMfbConfig({ ...local, NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)!.tokenUrl, "http://127.0.0.1:4010/t");
    assert.throws(() => getMfbConfig({ ...local, NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv), /https/);
    assert.throws(() => getMfbConfig({ ...base, MYFLIGHTBOOK_TOKEN_URL: "http://myflightbook.com/t" } as unknown as NodeJS.ProcessEnv), /https/);
    assert.throws(() => getMfbConfig({ ...base, MYFLIGHTBOOK_AUTH_URL: "not a url" } as unknown as NodeJS.ProcessEnv), /valid URL/);
  });
});

describe("authorization + token requests", () => {
  it("builds the authorize URL", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "https://lumiritin.test/cb", "st8"));
    assert.equal(u.origin + u.pathname, cfg.authUrl);
    assert.deepEqual(Object.fromEntries(u.searchParams), {
      client_id: "lumiritin",
      redirect_uri: "https://lumiritin.test/cb",
      response_type: "code",
      scope: "readflight",
      state: "st8",
    });
  });
  it("exchanges the code with form fields", async () => {
    const { impl, calls } = fakeFetch(200, { access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "readflight" });
    const t = await exchangeCode(cfg, "the-code", "https://lumiritin.test/cb", impl);
    assert.equal(calls[0].url, cfg.tokenUrl);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(header(calls[0].init, "content-type"), "application/x-www-form-urlencoded");
    assert.deepEqual(form(calls[0].init), {
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "https://lumiritin.test/cb",
      client_id: "lumiritin",
      client_secret: "shh",
    });
    assert.equal(t.accessToken, "AT");
    assert.equal(t.refreshToken, "RT");
    assert.ok(t.expiresAt && t.expiresAt.getTime() > Date.now());
  });
  it("refreshes without redirect_uri and keeps the old refresh token if none is rotated in", async () => {
    const { impl, calls } = fakeFetch(200, { access_token: "AT2" });
    const t = await refreshTokens(cfg, "RT-old", impl);
    const f = form(calls[0].init);
    assert.equal(f.grant_type, "refresh_token");
    assert.equal(f.refresh_token, "RT-old");
    assert.ok(!("redirect_uri" in f));
    assert.equal(t.refreshToken, "RT-old");
  });
  it("turns token failures into auth errors", async () => {
    await assert.rejects(exchangeCode(cfg, "bad", "https://x/cb", fakeFetch(400, "The authorization code is invalid").impl), MfbAuthError);
    assert.throws(() => parseTokenResponse(JSON.stringify({ error: "invalid_grant" })), /invalid_grant/);
    assert.throws(() => parseTokenResponse("<html>"), /not JSON/);
  });
});

describe("resource calls", () => {
  it("POSTs form fields with a Bearer header, never szAuthToken, never the token in the URL", async () => {
    const { impl, calls } = fakeFetch(200, []);
    await callResource(cfg, "FlightsWithQueryAndOffset", "AT", { fq: "{}", offset: 200, maxCount: 100 }, impl);
    const { url, init } = calls[0];
    assert.equal(url, "https://mfb.test/logbook/mvc/oAuth/OAuthResource/FlightsWithQueryAndOffset?json=1");
    assert.equal(init.method, "POST");
    assert.equal(header(init, "authorization"), "Bearer AT");
    assert.equal(header(init, "content-type"), "application/x-www-form-urlencoded");
    assert.deepEqual(form(init), { fq: "{}", offset: "200", maxCount: "100" });
    assert.ok(!url.includes("access_token"));
  });
  it("maps 401/403 to an auth error and other failures to a plain error", async () => {
    await assert.rejects(callResource(cfg, "x", "AT", {}, fakeFetch(401, "no").impl), MfbAuthError);
    await assert.rejects(callResource(cfg, "x", "AT", {}, fakeFetch(500, "boom").impl), (e: unknown) => e instanceof MfbError && !(e instanceof MfbAuthError));
    await assert.rejects(callResource(cfg, "x", "AT", {}, fakeFetch(200, "<xml/>").impl), /did not return JSON/);
  });
  it("treats a non-list reply as an error, never as zero flights", () => {
    assert.equal(unwrapRows([{ a: 1 }]).length, 1);
    assert.equal(unwrapRows({ FlightsWithQueryAndOffsetResult: [{ a: 1 }, { a: 2 }] }).length, 2);
    assert.throws(() => unwrapRows({ error: "nope" }), /Unexpected/);
    assert.throws(() => unwrapRows("oops"), /Unexpected/);
  });
});

describe("fetchAllFlights", () => {
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => flightRow(from + i));

  it("walks every page until a short one, deduping and counting skips by reason", async () => {
    const all = [...rows(1, 100), ...rows(101, 100), ...rows(201, 50), { FlightID: 0, Date: "2026-01-01" }, { FlightID: 9, Date: null }, { FlightID: 10, Date: "2026-01-01", TotalFlightTime: 0 }];
    all.splice(5, 0, flightRow(3)); // a duplicate FlightID
    const { impl, calls } = fakeFetch((_n, _u, init) => {
      const f = form(init);
      return { status: 200, body: all.slice(Number(f.offset), Number(f.offset) + Number(f.maxCount)) };
    });
    const r = await fetchAllFlights(cfg, () => "AT", async () => {}, impl, { pauseMs: 0 });
    assert.equal(r.flights.length, 250);
    assert.deepEqual(r.skipped, { no_id: 1, no_date: 1, no_time: 1, too_long: 0 });
    assert.equal(r.skippedTotal, 3);
    assert.equal(r.complete, true);
    assert.deepEqual(calls.map((c) => form(c.init).offset), ["0", "100", "200", "300"].slice(0, calls.length));
    assert.ok(calls.every((c) => form(c.init).fq === "{}"));
  });

  it("refreshes once on a rejected token and retries the same page", async () => {
    let refreshed = 0;
    let token = "OLD";
    const { impl, calls } = fakeFetch((_n, _u, init) => {
      const bearer = header(init, "authorization");
      return bearer === "Bearer NEW" ? { status: 200, body: rows(1, 3) } : { status: 401, body: "invalid_token" };
    });
    const r = await fetchAllFlights(cfg, () => token, async () => { refreshed++; token = "NEW"; }, impl, { pauseMs: 0 });
    assert.equal(refreshed, 1);
    assert.equal(r.flights.length, 3);
    assert.equal(calls.length, 2);
  });

  it("gives up if the token is still rejected after a refresh", async () => {
    const { impl } = fakeFetch(401, "invalid_token");
    await assert.rejects(fetchAllFlights(cfg, () => "AT", async () => {}, impl, { pauseMs: 0 }), MfbAuthError);
  });

  it("stops (instead of looping) when the server ignores the offset", async () => {
    const { impl, calls } = fakeFetch(200, rows(1, 100)); // same full page every time
    const r = await fetchAllFlights(cfg, () => "AT", async () => {}, impl, { pauseMs: 0, maxPages: 50 });
    assert.equal(r.flights.length, 100);
    assert.equal(r.complete, false);
    assert.equal(calls.length, 2);
  });

  it("reports an incomplete walk when the page limit is hit", async () => {
    const { impl } = fakeFetch((_n, _u, init) => ({ status: 200, body: rows(Number(form(init).offset) + 1, 100) }));
    const r = await fetchAllFlights(cfg, () => "AT", async () => {}, impl, { pauseMs: 0, maxPages: 3 });
    assert.equal(r.flights.length, 300);
    assert.equal(r.complete, false);
  });

  it("treats an empty logbook as complete with nothing to import", async () => {
    const r = await fetchAllFlights(cfg, () => "AT", async () => {}, fakeFetch(200, []).impl, { pauseMs: 0 });
    assert.deepEqual([r.flights.length, r.rawCount, r.complete], [0, 0, true]);
  });

  it("hands the first raw row to the sample hook once", async () => {
    const seen: unknown[] = [];
    await fetchAllFlights(cfg, () => "AT", async () => {}, fakeFetch(200, rows(1, 2)).impl, { pauseMs: 0, onSample: (r) => seen.push(r.FlightID) });
    assert.deepEqual(seen, [1]);
  });
});

describe("flight mapping", () => {
  it("reads FlightID, Date and Landings plus the hour fields", () => {
    const n = normalizeFlight({
      FlightID: 4521, Date: "2026-03-04T00:00:00", Landings: 4, NightLandings: 1, TotalFlightTime: "2.3", PIC: 2.3, SIC: 0, Dual: 0.5,
      CFI: 0, CrossCountry: 1.8, Nighttime: 0.4, IMC: 0.2, SimulatedIFR: 0.1, Route: " FALA FAPM ", TailNumDisplay: "ZS-ABC", ModelDisplay: "R44",
      Comment: "passenger: Jane Doe",
    });
    assert.ok(n.ok);
    assert.deepEqual(n.flight, {
      externalId: "4521", date: "2026-03-04", route: "FALA FAPM", tailNumber: "ZS-ABC", aircraftModel: "R44", landings: 4, nightLandings: 1,
      total: 2.3, pic: 2.3, sic: 0, dual: 0.5, instructor: 0, night: 0.4, instrument: 0.3,
    });
    assert.ok(!JSON.stringify(n.flight).includes("Jane Doe"), "free-text comments must not be imported");
  });
  it("derives landings consistently", () => {
    const l = (extra: Record<string, unknown>) => {
      const n = normalizeFlight(flightRow(1, extra));
      assert.ok(n.ok);
      return [n.flight.landings, n.flight.nightLandings];
    };
    assert.deepEqual(l({ Landings: 3, NightLandings: 1 }), [3, 1]);
    assert.deepEqual(l({ Landings: 0, FullStopLandings: 2, NightLandings: 1 }), [3, 1]); // fall back when Landings is blank
    assert.deepEqual(l({ Landings: 1, NightLandings: 5 }), [1, 1]); // night can't exceed the total
    assert.deepEqual(l({ Landings: 0 }), [0, 0]);
  });
  it("clamps categories to the flight total and never trusts negatives", () => {
    const n = normalizeFlight(flightRow(1, { TotalFlightTime: 1, PIC: 5, Nighttime: -2, IMC: 0.8, SimulatedIFR: 0.8 }));
    assert.ok(n.ok);
    assert.deepEqual([n.flight.pic, n.flight.night, n.flight.instrument], [1, 0, 1]);
  });
  it("reports why a row was skipped", () => {
    const why = (raw: unknown) => { const n = normalizeFlight(raw); return n.ok ? "ok" : n.reason; };
    assert.equal(why(null), "no_id");
    assert.equal(why({ Date: "2026-01-02", TotalFlightTime: 1 }), "no_id");
    assert.equal(why({ FlightID: -1, Date: "2026-01-02", TotalFlightTime: 1 }), "no_id");
    assert.equal(why({ FlightID: 5, Date: "garbage", TotalFlightTime: 1 }), "no_date");
    assert.equal(why({ FlightID: 5, Date: "2026-01-02", TotalFlightTime: 0 }), "no_time");
    assert.equal(why({ FlightID: 5, Date: "2026-01-02", TotalFlightTime: 30 }), "too_long");
    assert.equal(why({ FlightID: "7", Date: "2026-01-02", TotalFlightTime: "1.5" }), "ok");
  });
  it("parses the local date without shifting it across time zones", () => {
    assert.equal(parseMfbDate("2026-03-04T00:00:00"), "2026-03-04");
    assert.equal(parseMfbDate("2026-03-04T23:59:59-08:00"), "2026-03-04");
    assert.equal(parseMfbDate("/Date(1772582400000)/"), "2026-03-04");
    assert.equal(parseMfbDate(1772582400000), "2026-03-04");
    assert.equal(parseMfbDate("04/03/2026"), null);
  });
});

describe("log entry mapping", () => {
  it("only keeps tokens that look like airfields from the free-text route", () => {
    assert.deepEqual(routeToAirfields("FALA FAPM FALA"), { from: "FALA", to: "FALA" });
    assert.deepEqual(routeToAirfields("FAGC-FAPE"), { from: "FAGC", to: "FAPE" });
    assert.deepEqual(routeToAirfields("FALA direct Hoedspruit"), { from: "FALA", to: null });
    assert.deepEqual(routeToAirfields("FALA DCT FAPM"), { from: "FALA", to: "FAPM" });
    assert.deepEqual(routeToAirfields(null), { from: null, to: null });
  });
  it("builds an IMPORTED, self-declared row keyed by FlightID, with 0 hours stored as not-recorded", () => {
    const n = normalizeFlight({ FlightID: 77, Date: "2026-03-04", TotalFlightTime: 1.5, PIC: 1.5, Landings: 3, NightLandings: 1, Route: "FALA FAPM", ModelDisplay: "R44", TailNumDisplay: "ZS-ABC" });
    assert.ok(n.ok);
    const e = toEntryData("person1", n.flight);
    assert.equal(e.source, "IMPORTED");
    assert.equal(e.verified, false);
    assert.equal(e.externalSource, MFB_SOURCE);
    assert.equal(e.externalId, "77");
    assert.equal(e.date.toISOString(), "2026-03-04T00:00:00.000Z");
    assert.deepEqual([e.totalHours, e.picHours, e.coPilotHours, e.nightHours, e.instrumentHours], [1.5, 1.5, null, null, null]);
    assert.deepEqual([e.dayLandings, e.nightLandings], [2, 1]);
    assert.deepEqual([e.departureIcao, e.arrivalIcao, e.aircraftType, e.aircraftReg], ["FALA", "FAPM", "R44", "ZS-ABC"]);
  });
  it("fingerprints equal for an unchanged row (Decimal-like values from the database) and differs on change", () => {
    const n = normalizeFlight(flightRow(5, { NightLandings: 1, Route: "FALA FAPM" }));
    assert.ok(n.ok);
    const data = toEntryData("p", n.flight);
    const fromDb = { ...data, totalHours: { toString: () => "1.5" }, picHours: { toString: () => "1.5" }, date: new Date("2026-03-04") };
    assert.equal(fingerprint(fromDb), fingerprint(data));
    assert.notEqual(fingerprint({ ...fromDb, dayLandings: 9 }), fingerprint(data));
    assert.notEqual(fingerprint({ ...fromDb, totalHours: { toString: () => "2.0" } }), fingerprint(data));
  });
});
