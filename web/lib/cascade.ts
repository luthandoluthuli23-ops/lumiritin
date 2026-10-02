// Crew dispatch: shortlist → 10-minute confirm-pings → cascade to the next candidate.
//
//   • dispatchRequest pings the top SHORTLIST_SIZE ranked pilots at once.
//   • A ping is open for PING_WINDOW_MS. The first pilot to accept wins; the other open pings are cancelled.
//   • When a ping expires or is declined, the next-ranked pilot (#4, then #5, ...) is pinged, so up to
//     CASCADE_WIDTH pings are open at any time until the request is filled or candidates run out.
//
// Nothing here relies on a timer inside the web server (those do not survive restarts or serverless). Instead
// advanceCascade() is idempotent and is called from every place that can notice time passing: the operator's
// status polling, a pilot's response, and jobs/cascade-tick.ts (run it every minute from cron for full coverage).
import { randomBytes } from "node:crypto";
import type { CrewRequest, Prisma } from "@prisma/client";
import { db } from "./db";
import { resolveState } from "./availability";
import { benchEarningZar } from "./bench";
import { matchPilots, SHORTLIST_SIZE, type CandidateInput, type MatchRequest, type MatchResult } from "./matching";
import { sendCrewPing } from "./whatsapp";

export const PING_WINDOW_MS = 10 * 60_000;
export const CASCADE_WIDTH = SHORTLIST_SIZE;

const baseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const pingLink = (token: string) => `${baseUrl()}/crew/respond/${token}`;

type Tx = Prisma.TransactionClient;
type RequestRow = CrewRequest;

// ─── Candidate loading and ranking ──────────────────────────────────────────

async function loadCandidates(client: Tx | typeof db, now: Date): Promise<CandidateInput[]> {
  const people = await client.person.findMany({
    where: { role: "PILOT" },
    include: {
      credentials: { where: { type: "PILOT_LICENCE" }, include: { ratings: true }, take: 1 },
      medicals: true,
      logbook: { select: { totalHours: true } },
      availability: { where: { endsAt: { gt: new Date(now.getTime() - 86_400_000) } } },
      rosterEntries: { where: { status: "ACTIVE" }, select: { operatorId: true, sharedToPool: true } },
    },
  });
  const airfields = await client.airfield.findMany({ select: { icao: true, lat: true, lng: true } });
  const coords = new Map(airfields.map((a) => [a.icao, { lat: a.lat, lng: a.lng }]));

  return people.map((p) => {
    const cred = p.credentials[0];
    return {
      personId: p.id,
      name: p.fullName,
      homeIcao: p.homeAirfieldIcao,
      homeCoords: p.homeAirfieldIcao ? (coords.get(p.homeAirfieldIcao) ?? null) : null,
      travelRadiusKm: p.travelRadiusKm,
      ratings: (cred?.ratings ?? []).map((r) => ({ name: r.name, source: r.source, expiresAt: r.expiresAt })),
      licence: cred
        ? { expiresAt: cred.expiresAt, portalStatus: cred.portalStatus, lastVerificationResult: cred.lastVerificationResult, lastVerifiedAt: cred.lastVerifiedAt }
        : null,
      medicals: p.medicals.map((m) => ({ class: m.class, expiresAt: m.expiresAt })),
      totalHours: p.logbook ? Number(p.logbook.totalHours) : null,
      windows: p.availability.map((a) => ({ state: a.state, startsAt: a.startsAt, endsAt: a.endsAt })),
      rosterOperatorIds: p.rosterEntries.map((r) => r.operatorId),
      sharedToPool: p.rosterEntries.some((r) => r.sharedToPool),
    };
  });
}

export async function rankForRequest(request: RequestRow, client: Tx | typeof db = db, now: Date = new Date()): Promise<MatchResult> {
  const [candidates, departure, contributes] = await Promise.all([
    loadCandidates(client, now),
    client.airfield.findUnique({ where: { icao: request.departureIcao }, select: { lat: true, lng: true } }),
    client.crewRoster.count({ where: { operatorId: request.operatorId, status: "ACTIVE", sharedToPool: true } }),
  ]);
  const req: MatchRequest = {
    operatorId: request.operatorId,
    requiredTypes: request.requiredRatings,
    departure,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    minTotalHours: request.minTotalHours,
    requesterContributesToPool: contributes > 0,
    now,
  };
  return matchPilots(candidates, req);
}

// ─── Pings ──────────────────────────────────────────────────────────────────

const newToken = () => randomBytes(24).toString("base64url");

async function lockRequest(tx: Tx, id: string): Promise<RequestRow | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM request WHERE id = ${id} FOR UPDATE`;
  return locked.length ? tx.crewRequest.findUnique({ where: { id } }) : null;
}

/** Creates PENDING pings for the given ranked pilots. Returns what was created so it can be sent after commit. */
async function createPings(tx: Tx, request: RequestRow, picks: { personId: string }[], firstRank: number, now: Date) {
  const created = [];
  for (const [i, p] of picks.entries()) {
    created.push(
      await tx.crewPing.create({
        data: { crewRequestId: request.id, personId: p.personId, rank: firstRank + i, token: newToken(), expiresAt: new Date(now.getTime() + PING_WINDOW_MS) },
        include: { person: { select: { fullName: true, whatsappE164: true, consents: { where: { scope: "whatsapp_notifications", revokedAt: null }, select: { id: true } } } } },
      }),
    );
  }
  return created;
}

const fmtWindow = (s: Date, e: Date) => {
  const day = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day.format(s)}, ${time.format(s)} – ${time.format(e)}`;
};

type CreatedPing = Awaited<ReturnType<typeof createPings>>[number];

/** WhatsApp the pilot (only with their consent and a number). The in-app ping exists either way. */
async function notify(request: RequestRow, pings: CreatedPing[]): Promise<void> {
  await Promise.all(
    pings.map(async (p) => {
      if (!p.person.whatsappE164 || p.person.consents.length === 0) return;
      const sent = await sendCrewPing({
        toE164: p.person.whatsappE164,
        name: p.person.fullName,
        route: `${request.departureIcao} · ${request.requiredRatings.join("/") || "crew"}`,
        window: fmtWindow(request.startsAt, request.endsAt),
        link: pingLink(p.token),
        minutes: PING_WINDOW_MS / 60_000,
      });
      if (sent) await db.crewPing.update({ where: { id: p.id }, data: { whatsappSent: true } });
    }),
  );
}

export type DispatchResult =
  | { ok: true; pinged: number; candidatesRemaining: number }
  | { ok: false; error: "not_found" | "not_open" | "already_dispatched" | "no_candidates" | "in_the_past" };

export async function dispatchRequest(requestId: string, operatorId: string, now: Date = new Date()): Promise<DispatchResult> {
  let request: RequestRow | null = null;
  let created: CreatedPing[] = [];
  let remaining = 0;

  const failure = await db.$transaction(async (tx): Promise<DispatchResult | null> => {
    request = await lockRequest(tx, requestId);
    if (!request || request.operatorId !== operatorId) return { ok: false, error: "not_found" };
    if (request.status !== "OPEN") return { ok: false, error: "not_open" };
    if (request.dispatchedAt) return { ok: false, error: "already_dispatched" };
    if (request.startsAt <= now) return { ok: false, error: "in_the_past" };

    const { shortlist, ranked } = await rankForRequest(request, tx, now);
    if (shortlist.length === 0) return { ok: false, error: "no_candidates" };

    created = await createPings(tx, request, shortlist, 1, now);
    remaining = ranked.length - shortlist.length;
    await tx.crewRequest.update({ where: { id: requestId }, data: { dispatchedAt: now } });
    return null;
  });
  if (failure) return failure;

  await notify(request!, created);
  return { ok: true, pinged: created.length, candidatesRemaining: remaining };
}

/**
 * Expires overdue pings and, if the request is still open, pings the next-ranked pilots so CASCADE_WIDTH stay open.
 * Safe to call at any time and from anywhere; does nothing for requests that are filled, undispatched or in the past.
 */
export async function advanceCascade(requestId: string, now: Date = new Date()): Promise<{ expired: number; newlyPinged: number }> {
  let request: RequestRow | null = null;
  let created: CreatedPing[] = [];
  let expired = 0;

  await db.$transaction(async (tx) => {
    request = await lockRequest(tx, requestId);
    if (!request || request.status !== "OPEN" || !request.dispatchedAt) return;

    expired = (await tx.crewPing.updateMany({ where: { crewRequestId: requestId, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } })).count;
    if (request.startsAt <= now) return; // too late to start new pings for a job that has begun

    const pings = await tx.crewPing.findMany({ where: { crewRequestId: requestId }, select: { personId: true, status: true, rank: true } });
    const open = pings.filter((p) => p.status === "PENDING").length;
    const need = CASCADE_WIDTH - open;
    if (need <= 0) return;

    const pinged = new Set(pings.map((p) => p.personId));
    const { ranked } = await rankForRequest(request, tx, now);
    const next = ranked.filter((m) => !pinged.has(m.personId)).slice(0, need);
    if (next.length === 0) return;

    created = await createPings(tx, request, next, Math.max(0, ...pings.map((p) => p.rank)) + 1, now);
  });

  if (request && created.length) await notify(request, created);
  return { expired, newlyPinged: created.length };
}

// ─── Pilot response ─────────────────────────────────────────────────────────

export type RespondError = "not_found" | "not_pending" | "expired" | "already_filled" | "no_longer_available";
export type RespondResult = { ok: true; decision: "ACCEPT" | "DECLINE"; requestId: string } | { ok: false; error: RespondError; status?: string };

export async function respondToPing(token: string, decision: "ACCEPT" | "DECLINE", now: Date = new Date()): Promise<RespondResult> {
  const found = await db.crewPing.findUnique({ where: { token }, select: { id: true, crewRequestId: true } });
  if (!found) return { ok: false, error: "not_found" };

  const result = await db.$transaction(async (tx): Promise<RespondResult> => {
    const request = await lockRequest(tx, found.crewRequestId);
    const ping = await tx.crewPing.findUnique({ where: { id: found.id } });
    if (!request || !ping) return { ok: false, error: "not_found" };

    if (ping.status !== "PENDING") return { ok: false, error: "not_pending", status: ping.status };
    if (ping.expiresAt <= now) {
      await tx.crewPing.update({ where: { id: ping.id }, data: { status: "EXPIRED", respondedAt: now } });
      return { ok: false, error: "expired" };
    }
    if (request.status !== "OPEN") {
      await tx.crewPing.update({ where: { id: ping.id }, data: { status: "CANCELLED", respondedAt: now } });
      return { ok: false, error: "already_filled" };
    }

    if (decision === "DECLINE") {
      await tx.crewPing.update({ where: { id: ping.id }, data: { status: "DECLINED", respondedAt: now } });
      return { ok: true, decision, requestId: request.id };
    }

    // ACCEPT: the pilot's availability may have changed since the ping went out, so check again under the lock.
    const windows = await tx.availability.findMany({ where: { personId: ping.personId, endsAt: { gt: new Date(now.getTime() - 86_400_000) } } });
    const state = resolveState(windows.map((w) => ({ state: w.state, startsAt: w.startsAt, endsAt: w.endsAt })), request.startsAt, request.endsAt, now);
    if (state.state !== "AVAILABLE") return { ok: false, error: "no_longer_available", status: state.state };

    await tx.crewPing.update({ where: { id: ping.id }, data: { status: "ACCEPTED", respondedAt: now } });
    await tx.crewPing.updateMany({ where: { crewRequestId: request.id, status: "PENDING", id: { not: ping.id } }, data: { status: "CANCELLED", respondedAt: now } });
    await tx.crewRequest.update({ where: { id: request.id }, data: { status: "FILLED", assignedPersonId: ping.personId, filledAt: now } });
    // Automated window locking: the pilot is BOOKED for exactly the job window.
    await tx.availability.create({
      data: { personId: ping.personId, state: "BOOKED", source: "BOOKING", startsAt: request.startsAt, endsAt: request.endsAt, crewRequestId: request.id, note: `${request.departureIcao} crew request` },
    });

    // Bench earning for the operator that rosters this pilot (if it is not the requester).
    const lender = await tx.crewRoster.findFirst({
      where: { personId: ping.personId, status: "ACTIVE", operatorId: { not: request.operatorId } },
      orderBy: [{ sharedToPool: "desc" }, { createdAt: "asc" }],
    });
    if (lender) {
      await tx.benchEarning.create({
        data: { operatorId: lender.operatorId, crewRequestId: request.id, personId: ping.personId, hoursBilled: request.hoursRequired, amountZar: benchEarningZar(request.role, request.hoursRequired) },
      });
    }
    return { ok: true, decision, requestId: request.id };
  });

  // A decline frees a slot: move the cascade on straight away rather than waiting for the next tick.
  if (result.ok && decision === "DECLINE") await advanceCascade(result.requestId, now);
  return result;
}

/** For the cron job: every dispatched, still-open request. */
export const openDispatchedRequestIds = async (): Promise<string[]> =>
  (await db.crewRequest.findMany({ where: { status: "OPEN", dispatchedAt: { not: null }, startsAt: { gt: new Date() } }, select: { id: true } })).map((r) => r.id);
