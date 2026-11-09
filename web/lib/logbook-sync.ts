import "server-only";
import { db } from "@/lib/db";
import { MfbAuthError, fetchAllFlights, refreshTokens, type MfbTokens, type SkipReason } from "@/lib/myflightbook/client";
import { getMfbConfig } from "@/lib/myflightbook/config";
import { decryptSecret, encryptSecret } from "@/lib/myflightbook/crypto";
import { MFB_SOURCE, fingerprint, toEntryData, type ImportedEntryData } from "@/lib/myflightbook/entry";

// Pulls a pilot's flights from MyFlightbook into flight_log_entry. Re-running is safe: rows are matched on
// (personId, externalSource, externalId = MyFlightbook FlightID), so a re-sync creates what is new, updates what changed,
// and removes what the pilot deleted over there. It NEVER touches CSV / Lumi / manual / platform rows, and an empty or
// failed fetch never deletes anything.

const REFRESH_SKEW_MS = 60_000;
const CREATE_CHUNK = 500;
const UPDATE_CHUNK = 100;

export type SyncErrorCode = "not_configured" | "not_connected" | "reauth_required" | "fetch_failed" | "save_failed";

export interface SyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Rows MyFlightbook returned that couldn't be imported (no date / no flight time / ...). */
  skipped: number;
  skippedReasons: Partial<Record<SkipReason, number>>;
  /** Importable flights found in MyFlightbook. */
  total: number;
  /** True when MyFlightbook had nothing usable; nothing was changed. */
  empty: boolean;
  lastSyncedAt: string;
}
export type SyncResult = ({ ok: true } & SyncSummary) | { ok: false; error: SyncErrorCode; message: string };

// What the pilot sees on the logbook page and API. Technical detail goes to the server log only.
const USER_MESSAGES: Record<SyncErrorCode, string> = {
  not_configured: "MyFlightbook isn't set up on this site yet.",
  not_connected: "MyFlightbook isn't connected. Connect it first.",
  reauth_required: "MyFlightbook access has expired or was revoked. Reconnect to keep syncing.",
  fetch_failed: "MyFlightbook didn't respond as expected. Please try again in a few minutes.",
  save_failed: "We couldn't save your flights. Please try again.",
};
const fail = (error: SyncErrorCode): SyncResult => ({ ok: false, error, message: USER_MESSAGES[error] });

/** Create or replace the pilot's MyFlightbook connection (tokens are encrypted at rest). */
export async function saveConnection(personId: string, t: MfbTokens): Promise<void> {
  const data = {
    accessTokenEnc: encryptSecret(t.accessToken),
    refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken) : null,
    accessTokenExpiresAt: t.expiresAt,
    scope: t.scope,
    lastError: null,
  };
  await db.externalConnection.upsert({
    where: { personId_provider: { personId, provider: MFB_SOURCE } },
    create: { personId, provider: MFB_SOURCE, ...data },
    update: data,
  });
}

export interface MfbStatus {
  connected: true;
  connectedAt: string;
  lastSyncedAt: string | null;
  /** A pilot-safe sentence, never a raw upstream response. */
  lastError: string | null;
  flightCount: number;
}

/** The pilot's connection state for the logbook page, or null when not connected. */
export async function getMfbStatus(personId: string): Promise<MfbStatus | null> {
  const [conn, flightCount] = await Promise.all([
    db.externalConnection.findUnique({
      where: { personId_provider: { personId, provider: MFB_SOURCE } },
      select: { connectedAt: true, lastSyncedAt: true, lastError: true },
    }),
    db.flightLogEntry.count({ where: { personId, externalSource: MFB_SOURCE } }),
  ]);
  if (!conn) return null;
  return {
    connected: true,
    connectedAt: conn.connectedAt.toISOString(),
    lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
    lastError: conn.lastError,
    flightCount,
  };
}

export async function syncMyFlightbook(personId: string): Promise<SyncResult> {
  let cfg;
  try {
    cfg = getMfbConfig();
  } catch (e) {
    console.error("[connect.myflightbook] misconfigured:", e instanceof Error ? e.message : e);
    return fail("not_configured");
  }
  if (!cfg) return fail("not_configured");

  const conn = await db.externalConnection.findUnique({ where: { personId_provider: { personId, provider: MFB_SOURCE } } });
  if (!conn) return fail("not_connected");

  const record = (code: SyncErrorCode) => db.externalConnection.update({ where: { id: conn.id }, data: { lastError: USER_MESSAGES[code] } }).catch(() => undefined);

  let access: string;
  let refresh: string | null;
  try {
    access = decryptSecret(conn.accessTokenEnc);
    refresh = conn.refreshTokenEnc ? decryptSecret(conn.refreshTokenEnc) : null;
  } catch {
    // SESSION_SECRET was rotated (or the row is corrupt): the stored tokens can't be read, the pilot must reconnect.
    await record("reauth_required");
    return fail("reauth_required");
  }

  const refreshNow = async () => {
    if (!refresh) throw new MfbAuthError("No refresh token stored");
    const t = await refreshTokens(cfg, refresh);
    access = t.accessToken;
    refresh = t.refreshToken;
    await saveConnection(personId, t);
  };

  let fetched;
  try {
    if (conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - REFRESH_SKEW_MS < Date.now()) await refreshNow();
    fetched = await fetchAllFlights(cfg, () => access, refreshNow, fetch, {
      onSample: process.env.MYFLIGHTBOOK_DEBUG === "1" ? logSample : undefined,
    });
  } catch (e) {
    console.error("[connect.myflightbook] fetch failed:", e instanceof Error ? e.message : e);
    const code: SyncErrorCode = e instanceof MfbAuthError ? "reauth_required" : "fetch_failed";
    await record(code);
    return fail(code);
  }

  const now = new Date();
  const base = {
    skipped: fetched.skippedTotal,
    skippedReasons: Object.fromEntries(Object.entries(fetched.skipped).filter(([, n]) => n > 0)) as Partial<Record<SkipReason, number>>,
    total: fetched.flights.length,
    lastSyncedAt: now.toISOString(),
  };

  // Nothing usable came back: change nothing (a blip must never wipe an imported logbook), just record the sync.
  if (fetched.flights.length === 0) {
    await db.externalConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: now, lastError: null } });
    return { ok: true, created: 0, updated: 0, unchanged: 0, removed: 0, empty: true, ...base };
  }

  try {
    const existing = await db.flightLogEntry.findMany({
      where: { personId, externalSource: MFB_SOURCE },
      select: {
        id: true, externalId: true, date: true, departureIcao: true, arrivalIcao: true, aircraftType: true, aircraftReg: true,
        totalHours: true, picHours: true, coPilotHours: true, dualHours: true, instructorHours: true, nightHours: true,
        instrumentHours: true, dayLandings: true, nightLandings: true,
      },
    });
    const byExternalId = new Map(existing.map((r) => [r.externalId as string, r]));

    const toCreate: ImportedEntryData[] = [];
    const toUpdate: { id: string; data: ImportedEntryData }[] = [];
    let unchanged = 0;
    const seen = new Set<string>();
    for (const f of fetched.flights) {
      seen.add(f.externalId);
      const data = toEntryData(personId, f);
      const row = byExternalId.get(f.externalId);
      if (!row) toCreate.push(data);
      else if (fingerprint(row) !== fingerprint(data)) toUpdate.push({ id: row.id, data });
      else unchanged++;
    }
    // Only after a complete walk: a run that stopped early must not look like "the pilot deleted everything else".
    const toRemove = fetched.complete ? existing.filter((r) => !seen.has(r.externalId as string)).map((r) => r.id) : [];

    for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
      await db.flightLogEntry.createMany({ data: toCreate.slice(i, i + CREATE_CHUNK), skipDuplicates: true });
    }
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
      await db.$transaction(
        toUpdate.slice(i, i + UPDATE_CHUNK).map(({ id, data }) => {
          // Identity columns (person, source, external ids) never change on update.
          const { personId: _p, source: _s, verified: _v, externalSource: _es, externalId: _ei, ...changes } = data;
          return db.flightLogEntry.update({ where: { id }, data: changes });
        }),
      );
    }
    for (let i = 0; i < toRemove.length; i += CREATE_CHUNK) {
      await db.flightLogEntry.deleteMany({ where: { id: { in: toRemove.slice(i, i + CREATE_CHUNK) }, personId, externalSource: MFB_SOURCE } });
    }

    await db.person.update({ where: { id: personId }, data: { logbookProvider: "MyFlightbook" } });
    await db.externalConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: now, lastError: null } });
    return { ok: true, created: toCreate.length, updated: toUpdate.length, unchanged, removed: toRemove.length, empty: false, ...base };
  } catch (e) {
    console.error("[connect.myflightbook] save failed:", e instanceof Error ? e.message : e);
    await record("save_failed");
    return fail("save_failed");
  }
}

/** Forget the connection (tokens). Optionally also delete the flights that were imported from MyFlightbook. */
export async function disconnectMyFlightbook(personId: string, removeFlights: boolean): Promise<{ removedFlights: number }> {
  const removedFlights = removeFlights
    ? (await db.flightLogEntry.deleteMany({ where: { personId, externalSource: MFB_SOURCE } })).count
    : 0;
  await db.externalConnection.deleteMany({ where: { personId, provider: MFB_SOURCE } });
  await db.person.updateMany({ where: { id: personId, logbookProvider: "MyFlightbook" }, data: { logbookProvider: null, logbookRef: null } });
  return { removedFlights };
}

/** Debug aid for the first real sign-in (MYFLIGHTBOOK_DEBUG=1): shows which landing/date fields the live API returns. */
function logSample(raw: Record<string, unknown>) {
  const pick = ["FlightID", "Date", "TotalFlightTime", "PIC", "Landings", "FullStopLandings", "NightLandings", "Nighttime"] as const;
  console.info("[connect.myflightbook] first flight (debug):", JSON.stringify(Object.fromEntries(pick.map((k) => [k, raw[k]]))));
}
