// Deterministic pilot matching. Rules and weights only: no learned model, no randomness, no hidden inputs.
// The same inputs always produce the same ranking, and every point can be traced to a line in `breakdown`.
//
// Hard gates (a pilot failing ANY gate is excluded, and the reasons are returned):
//   1. Pool access      own roster, freelancer, or shared to the pool AND the requester contributes to it
//   2. Availability     AVAILABLE for the whole job window (BOOKED and OFF are ignored completely)
//   3. Type rating      exact match for every required aircraft type, SACAA-verified, valid through the job
//   4. Licence          valid through the job, verified, no verifier flags, verification not stale
//   5. Medical          at least one medical of the required class, valid through the job
//   6. Radius           within the pilot's own stated travel radius (if they set one)
//   7. Hours            meets the request's minimum total hours (if set)
//
// Score for eligible pilots (max 100): proximity 60 + experience 25 + verification freshness 15.
import { resolveState, type AvailabilityWindow } from "@/lib/availability";
import { haversineKm, type Coordinates } from "@/lib/geo";

// ─── Tunable policy (change here, nowhere else) ─────────────────────────────

/** Professional flying needs a Class 1 medical. Confirm against current SACAA requirements before relying on this. */
export const MAX_MEDICAL_CLASS = 1;
/**
 * Until SACAA/Lumi verification is live for everyone, verification is ADVISORY — shown as a badge, never a hard
 * gate — so self-declared crew still appear and can be dispatched. Flip on (env MATCH_STRICT_VERIFICATION=true)
 * once crew credentials are actually being verified, and the licence/rating-verification gates start excluding again.
 */
export const STRICT_VERIFICATION = process.env.MATCH_STRICT_VERIFICATION === "true";
/** Self-declared ratings (typed at sign-up) count unless strict verification is on. */
export const REQUIRE_VERIFIED_RATING = STRICT_VERIFICATION;
/** A licence not re-verified within this many days is treated as unverified (only matters under strict verification). */
export const MAX_VERIFICATION_AGE_DAYS = 7;
export const SHORTLIST_SIZE = 3;

export type MatchRole = "PILOT" | "CABIN_CREW" | "AME" | "GROUND_CREW";
const ROLE_LABEL: Record<MatchRole, string> = { PILOT: "Pilot", CABIN_CREW: "Cabin crew", AME: "Engineer (AME)", GROUND_CREW: "Ground crew" };

export const SCORE_MAX = { proximity: 60, experience: 25, freshness: 15 } as const;
/** Hours at or above this earn full experience points. */
const EXPERIENCE_FULL_HOURS = 5000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CandidateInput {
  personId: string;
  name: string;
  homeIcao: string | null;
  homeCoords: Coordinates | null;
  travelRadiusKm: number | null;
  ratings: { name: string; source: string; expiresAt: Date | null }[];
  licence: { expiresAt: Date | null; portalStatus: string | null; lastVerificationResult: string | null; lastVerificationMethod: string | null; lastVerifiedAt: Date | null } | null;
  medicals: { class: number; expiresAt: Date | null }[];
  totalHours: number | null;
  windows: AvailabilityWindow[];
  /** Operators that have this pilot on an ACTIVE roster. Empty = freelancer. */
  rosterOperatorIds: string[];
  /** True if any of their active rosters offers them to the shared pool. */
  sharedToPool: boolean;
}

export interface MatchRequest {
  operatorId: string;
  /** Which crew role is being sought. Type ratings and the Class-1 medical gate apply only to PILOT. */
  role: MatchRole;
  /** ICAO type designators the pilot must hold, all of them. Empty = no type requirement. Ignored for non-pilots. */
  requiredTypes: string[];
  departure: Coordinates | null;
  startsAt: Date;
  endsAt: Date;
  minTotalHours: number | null;
  /** True if the requesting operator has at least one ACTIVE rostered pilot offered to the pool. */
  requesterContributesToPool: boolean;
  now: Date;
}

export type ExclusionCode =
  | "POOL_ACCESS"
  | "BOOKED"
  | "OFF"
  | "NO_RATING"
  | "RATING_UNVERIFIED"
  | "RATING_EXPIRES"
  | "NO_LICENCE"
  | "LICENCE_EXPIRES"
  | "LICENCE_FLAGGED"
  | "NOT_VERIFIED"
  | "VERIFICATION_STALE"
  | "NO_MEDICAL"
  | "MEDICAL_EXPIRES"
  | "OUTSIDE_RADIUS"
  | "LOW_HOURS";

export const EXCLUSION_LABEL: Record<ExclusionCode, string> = {
  POOL_ACCESS: "On another operator's roster and not available to you",
  BOOKED: "Booked or blocked for this period",
  OFF: "Not marked available",
  NO_RATING: "No matching type rating",
  RATING_UNVERIFIED: "Type rating not yet verified by SACAA",
  RATING_EXPIRES: "Type rating expires before the job ends",
  NO_LICENCE: "No licence on record",
  LICENCE_EXPIRES: "Licence expires before the job ends",
  LICENCE_FLAGGED: "SACAA record shows a problem with the licence",
  NOT_VERIFIED: "Licence not yet verified against SACAA",
  VERIFICATION_STALE: "SACAA verification is out of date",
  NO_MEDICAL: "No valid medical of the required class",
  MEDICAL_EXPIRES: "Medical expires before the job ends",
  OUTSIDE_RADIUS: "Outside the pilot's travel radius",
  LOW_HOURS: "Below the minimum total hours",
};

export interface Badge {
  label: string;
  value: string;
  ok: boolean;
}

export interface ScoreLine {
  criterion: "Proximity" | "Experience" | "Verification freshness";
  points: number;
  max: number;
  detail: string;
}

export interface Match {
  personId: string;
  name: string;
  score: number;
  distanceKm: number | null;
  badges: Badge[];
  breakdown: ScoreLine[];
  /** Which pool the pilot comes from, for display. */
  pool: "own roster" | "freelancer" | "shared pool";
}

export interface MatchResult {
  ranked: Match[];
  shortlist: Match[];
  excluded: { personId: string; reasons: ExclusionCode[] }[];
  /** Count of excluded pilots by their FIRST failing gate, for a compact "why not" summary. */
  exclusionSummary: Partial<Record<ExclusionCode, number>>;
}

// ─── Type rating matching ───────────────────────────────────────────────────

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Names pilots commonly write for a type, mapped to its ICAO designator. Anything not listed (or ambiguous, like
// "B737-300/900") does NOT match: when unsure we exclude rather than guess.
const ALIASES: Record<string, string[]> = {
  C525: ["CJ1", "CITATIONJET", "CITATIONCJ1"],
  C25A: ["CJ2", "CITATIONCJ2"],
  C25B: ["CJ3", "CITATIONCJ3"],
  C25C: ["CJ4", "CITATIONCJ4"],
  C56X: ["CITATIONEXCEL", "CITATIONXLS"],
  C680: ["CITATIONSOVEREIGN"],
  E50P: ["PHENOM100"],
  E55P: ["PHENOM300"],
  PC12: ["PC12NG", "PILATUSPC12"],
  B350: ["KINGAIR350", "BE350"],
  BE20: ["KINGAIR200", "B200", "KINGAIR250"],
  LJ45: ["LEARJET45"],
  GLF4: ["G450", "GULFSTREAMG450"],
  FA7X: ["FALCON7X"],
  B738: ["B737800", "737800"],
};

/** True only if `ratingName` is exactly the designator or one of its listed aliases. */
export function ratingMatchesType(ratingName: string, designator: string): boolean {
  const r = norm(ratingName);
  const d = norm(designator);
  return r === d || (ALIASES[d] ?? []).includes(r);
}

// ─── Scoring pieces ─────────────────────────────────────────────────────────

/** Proximity tiers (max 60). Weighted heavily under 50 km, as dispatchers need someone who can actually get there. */
export function proximityPoints(km: number | null): { points: number; detail: string } {
  if (km === null) return { points: 0, detail: "Home airfield unknown" };
  if (km < 50) return { points: 60, detail: `${Math.round(km)} km: under 50 km` };
  if (km < 150) return { points: 40, detail: `${Math.round(km)} km: 50–150 km` };
  if (km < 300) return { points: 20, detail: `${Math.round(km)} km: 150–300 km` };
  return { points: 5, detail: `${Math.round(km)} km: over 300 km` };
}

export function experiencePoints(hours: number | null): { points: number; detail: string } {
  if (hours === null) return { points: 0, detail: "Hours not on record" };
  const points = Math.round((Math.min(hours, EXPERIENCE_FULL_HOURS) / EXPERIENCE_FULL_HOURS) * SCORE_MAX.experience);
  return { points, detail: `${Math.round(hours).toLocaleString("en-ZA")} total hrs (full marks at ${EXPERIENCE_FULL_HOURS.toLocaleString("en-ZA")})` };
}

export function freshnessPoints(verifiedAt: Date | null, now: Date): { points: number; detail: string } {
  if (!verifiedAt) return { points: 0, detail: "Never verified" };
  const hours = (now.getTime() - verifiedAt.getTime()) / 3_600_000;
  if (hours <= 24) return { points: 15, detail: "Verified in the last 24 h" };
  if (hours <= 72) return { points: 10, detail: "Verified in the last 3 days" };
  return { points: 5, detail: `Verified ${Math.floor(hours / 24)} days ago` };
}

const goodLicenceStatus = (s: string | null) => s !== null && /^\s*valid/i.test(s);

// ─── The matcher ────────────────────────────────────────────────────────────

/** Returns the reasons a candidate is NOT eligible, in gate order. Empty array = eligible. */
export function evaluate(c: CandidateInput, req: MatchRequest): ExclusionCode[] {
  const why: ExclusionCode[] = [];
  const end = req.endsAt.getTime();
  const isPilot = req.role === "PILOT";

  // 1. Pool access
  const own = c.rosterOperatorIds.includes(req.operatorId);
  const freelancer = c.rosterOperatorIds.length === 0;
  if (!own && !freelancer && !(c.sharedToPool && req.requesterContributesToPool)) why.push("POOL_ACCESS");

  // 2. Availability: BOOKED and OFF are ignored completely
  const state = resolveState(c.windows, req.startsAt, req.endsAt, req.now);
  if (state.state === "BOOKED") why.push("BOOKED");
  else if (state.state === "OFF") why.push("OFF");

  // 3. Type rating — pilots only (cabin crew, engineers and ground crew aren't type-rated like pilots)
  if (isPilot) {
    for (const type of req.requiredTypes) {
      const held = c.ratings.filter((r) => ratingMatchesType(r.name, type));
      if (held.length === 0) {
        why.push("NO_RATING");
        break;
      }
      const verified = REQUIRE_VERIFIED_RATING ? held.filter((r) => r.source !== "self-declared") : held;
      if (verified.length === 0) {
        why.push("RATING_UNVERIFIED");
        break;
      }
      if (!verified.some((r) => r.expiresAt === null || r.expiresAt.getTime() > end)) {
        why.push("RATING_EXPIRES");
        break;
      }
    }
  }

  // 4. Credential currency. Verification flags are a HARD gate only under strict verification; otherwise they're
  //    advisory (shown as a badge) so self-declared crew still appear until SACAA/Lumi verification is live.
  if (!c.licence) {
    why.push("NO_LICENCE");
  } else {
    const l = c.licence;
    if (l.expiresAt !== null && l.expiresAt.getTime() <= end) why.push("LICENCE_EXPIRES");
    if (STRICT_VERIFICATION) {
      if (l.lastVerificationResult === null) why.push("NOT_VERIFIED");
      else if (l.lastVerificationResult !== "VERIFIED" || !goodLicenceStatus(l.portalStatus)) why.push("LICENCE_FLAGGED");
      else if (!l.lastVerifiedAt || req.now.getTime() - l.lastVerifiedAt.getTime() > MAX_VERIFICATION_AGE_DAYS * 86_400_000) why.push("VERIFICATION_STALE");
    }
  }

  // 5. Medical — a Class-1 medical is a hard gate for pilots. Cabin/ground crew medicals differ, so for non-pilots
  //    an expired or missing medical is advisory, not a gate.
  if (isPilot) {
    const ofClass = c.medicals.filter((m) => m.class <= MAX_MEDICAL_CLASS);
    if (ofClass.length === 0) why.push("NO_MEDICAL");
    else if (!ofClass.some((m) => m.expiresAt !== null && m.expiresAt.getTime() > end)) why.push("MEDICAL_EXPIRES");
  }

  // 6. Radius (only when the pilot set one and we know both ends)
  if (c.travelRadiusKm !== null && c.homeCoords && req.departure && haversineKm(c.homeCoords, req.departure) > c.travelRadiusKm) {
    why.push("OUTSIDE_RADIUS");
  }

  // 7. Minimum hours
  if (req.minTotalHours !== null && (c.totalHours === null || c.totalHours < req.minTotalHours)) why.push("LOW_HOURS");

  return why;
}

function toMatch(c: CandidateInput, req: MatchRequest): Match {
  const km = c.homeCoords && req.departure ? haversineKm(c.homeCoords, req.departure) : null;
  const prox = proximityPoints(km);
  const exp = experiencePoints(c.totalHours);
  const fresh = freshnessPoints(c.licence?.lastVerifiedAt ?? null, req.now);

  const medical = c.medicals.slice().sort((a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0))[0];
  const own = c.rosterOperatorIds.includes(req.operatorId);
  const isPilot = req.role === "PILOT";
  const verified = c.licence?.lastVerificationResult === "VERIFIED";
  // Be honest about HOW the credential was verified: a live SACAA portal check vs Lumi reading the holder's document.
  const credentialValue = !verified
    ? "Self-declared"
    : c.licence?.lastVerificationMethod === "SACAA_PORTAL"
      ? "SACAA-verified"
      : c.licence?.lastVerificationMethod === "LUMI_DOCUMENT"
        ? "Lumi-verified"
        : "Verified";

  return {
    personId: c.personId,
    name: c.name,
    score: prox.points + exp.points + fresh.points,
    distanceKm: km === null ? null : Math.round(km),
    badges: [
      isPilot
        ? { label: "Rating", value: req.requiredTypes.length ? req.requiredTypes.join(", ") : "No type required", ok: true }
        : { label: "Role", value: ROLE_LABEL[req.role], ok: true },
      { label: "Distance", value: km === null ? "unknown" : `${Math.round(km)} km`, ok: km !== null && km < 50 },
      ...(medical ? [{ label: "Medical", value: medical.expiresAt ? `Class ${medical.class} to ${medical.expiresAt.toISOString().slice(0, 10)}` : `Class ${medical.class}`, ok: true }] : []),
      { label: "Credential", value: credentialValue, ok: verified },
    ],
    breakdown: [
      { criterion: "Proximity", points: prox.points, max: SCORE_MAX.proximity, detail: prox.detail },
      { criterion: "Experience", points: exp.points, max: SCORE_MAX.experience, detail: exp.detail },
      { criterion: "Verification freshness", points: fresh.points, max: SCORE_MAX.freshness, detail: fresh.detail },
    ],
    pool: own ? "own roster" : c.rosterOperatorIds.length === 0 ? "freelancer" : "shared pool",
  };
}

/** Deterministic order: higher score, then nearer, then personId. Unknown distance sorts last among equals. */
const compare = (a: Match, b: Match) =>
  b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.personId.localeCompare(b.personId);

export function matchPilots(candidates: readonly CandidateInput[], req: MatchRequest): MatchResult {
  const ranked: Match[] = [];
  const excluded: MatchResult["excluded"] = [];
  const exclusionSummary: MatchResult["exclusionSummary"] = {};

  for (const c of candidates) {
    const reasons = evaluate(c, req);
    if (reasons.length === 0) {
      ranked.push(toMatch(c, req));
    } else {
      excluded.push({ personId: c.personId, reasons });
      exclusionSummary[reasons[0]] = (exclusionSummary[reasons[0]] ?? 0) + 1;
    }
  }

  ranked.sort(compare);
  return { ranked, shortlist: ranked.slice(0, SHORTLIST_SIZE), excluded, exclusionSummary };
}
