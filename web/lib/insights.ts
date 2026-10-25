// Insights & reputation, computed from real platform activity. Scoring is a pure function so it is
// testable and explainable; the data loaders batch their queries so a whole roster costs a fixed
// number of round-trips, not one set per pilot.
import "server-only";
import { db } from "@/lib/db";

export type ReputationTier = "New" | "Developing" | "Bronze" | "Silver" | "Gold" | "Platinum";

export interface ReputationStats {
  offersReceived: number;
  accepted: number;
  declined: number;
  missed: number; // pinged, let it expire without responding
  responseRate: number; // 0–1, of pings they could still act on
  acceptRate: number; // 0–1, of the ones they responded to
  avgResponseMinutes: number | null;
  dutiesCompleted: number;
  upcomingDuties: number;
  totalHours: number;
  credentialsVerified: number; // verified AND in date
  credentialsTotal: number;
  medicalValid: boolean;
  earningsZar: number; // bench earnings credited while on a roster
}

export interface ReputationComponents {
  reliability: number; // 0–100
  compliance: number; // 0–100
  experience: number; // 0–100
}

export interface PilotReputation {
  personId: string;
  score: number; // 0–100
  tier: ReputationTier;
  components: ReputationComponents;
  stats: ReputationStats;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const r100 = (n: number) => Math.round(n * 100);

/** Pure scoring. Reliability rewards responding and showing up; compliance rewards verified, in-date
 *  credentials; experience rewards logged hours and completed duties. */
export function scoreReputation(stats: ReputationStats): { score: number; tier: ReputationTier; components: ReputationComponents } {
  const responded = stats.accepted + stats.declined;
  const respondable = responded + stats.missed;
  const responseRate = respondable > 0 ? responded / respondable : 0.5;
  const acceptRate = responded > 0 ? stats.accepted / responded : 0.5;
  const speedScore = stats.avgResponseMinutes == null ? 0.5 : clamp01(1 - stats.avgResponseMinutes / 120);
  const reliability = stats.offersReceived === 0 ? 50 : r100(0.5 * responseRate + 0.25 * acceptRate + 0.25 * speedScore);

  const verifiedRatio = stats.credentialsTotal > 0 ? stats.credentialsVerified / stats.credentialsTotal : 0;
  const compliance = r100(0.6 * verifiedRatio + 0.4 * (stats.medicalValid ? 1 : 0));

  const hoursScore = clamp01(stats.totalHours / 5000);
  const dutiesScore = clamp01(stats.dutiesCompleted / 20);
  const experience = r100(0.7 * hoursScore + 0.3 * dutiesScore);

  const score = Math.round(0.4 * reliability + 0.3 * compliance + 0.3 * experience);

  let tier: ReputationTier;
  if (stats.offersReceived === 0 && stats.dutiesCompleted === 0) tier = "New";
  else if (score >= 85) tier = "Platinum";
  else if (score >= 70) tier = "Gold";
  else if (score >= 55) tier = "Silver";
  else if (score >= 40) tier = "Bronze";
  else tier = "Developing";

  return { score, tier, components: { reliability, compliance, experience } };
}

/** Reputation for many pilots in a fixed number of queries. Returns a map keyed by personId. */
export async function computeReputations(personIds: string[]): Promise<Map<string, PilotReputation>> {
  const ids = [...new Set(personIds)];
  const out = new Map<string, PilotReputation>();
  if (ids.length === 0) return out;

  const now = new Date();
  const [pings, filled, logbooks, credentials, medicals, earnings] = await Promise.all([
    db.crewPing.findMany({ where: { personId: { in: ids } }, select: { personId: true, status: true, sentAt: true, respondedAt: true } }),
    db.crewRequest.findMany({ where: { assignedPersonId: { in: ids }, status: "FILLED" }, select: { assignedPersonId: true, endsAt: true } }),
    db.logbookSummary.findMany({ where: { personId: { in: ids } }, select: { personId: true, totalHours: true } }),
    db.credential.findMany({ where: { personId: { in: ids } }, select: { personId: true, expiresAt: true, lastVerificationResult: true } }),
    db.medical.findMany({ where: { personId: { in: ids } }, select: { personId: true, expiresAt: true } }),
    db.benchEarning.groupBy({ by: ["personId"], where: { personId: { in: ids } }, _sum: { amountZar: true } }),
  ]);

  const hoursBy = new Map(logbooks.map((l) => [l.personId, Number(l.totalHours)]));
  const earnBy = new Map(earnings.map((e) => [e.personId, e._sum.amountZar ?? 0]));

  for (const id of ids) {
    const myPings = pings.filter((p) => p.personId === id);
    const accepted = myPings.filter((p) => p.status === "ACCEPTED").length;
    const declined = myPings.filter((p) => p.status === "DECLINED").length;
    const missed = myPings.filter((p) => p.status === "EXPIRED").length;
    const responseTimes = myPings
      .filter((p) => p.respondedAt && (p.status === "ACCEPTED" || p.status === "DECLINED"))
      .map((p) => (p.respondedAt!.getTime() - p.sentAt.getTime()) / 60_000);
    const avgResponseMinutes = responseTimes.length ? Math.round(responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length) : null;

    const myFilled = filled.filter((f) => f.assignedPersonId === id);
    const dutiesCompleted = myFilled.filter((f) => f.endsAt < now).length;
    const upcomingDuties = myFilled.filter((f) => f.endsAt >= now).length;

    const myCreds = credentials.filter((c) => c.personId === id);
    const credentialsVerified = myCreds.filter((c) => c.lastVerificationResult === "VERIFIED" && (c.expiresAt === null || c.expiresAt >= now)).length;
    const medicalValid = medicals.some((m) => m.personId === id && (m.expiresAt === null || m.expiresAt >= now));

    const stats: ReputationStats = {
      offersReceived: myPings.length,
      accepted,
      declined,
      missed,
      responseRate: accepted + declined + missed > 0 ? (accepted + declined) / (accepted + declined + missed) : 0,
      acceptRate: accepted + declined > 0 ? accepted / (accepted + declined) : 0,
      avgResponseMinutes,
      dutiesCompleted,
      upcomingDuties,
      totalHours: hoursBy.get(id) ?? 0,
      credentialsVerified,
      credentialsTotal: myCreds.length,
      medicalValid,
      earningsZar: earnBy.get(id) ?? 0,
    };
    out.set(id, { personId: id, ...scoreReputation(stats), stats });
  }
  return out;
}

export async function pilotReputation(personId: string): Promise<PilotReputation> {
  const map = await computeReputations([personId]);
  return map.get(personId)!;
}

// ── Operator-level insights ──────────────────────────────────────────────────

export interface OperatorInsights {
  requestsPosted: number;
  requestsFilled: number;
  fillRate: number; // 0–1
  openRequests: number;
  avgTimeToFillHours: number | null;
  rosterActive: number;
  rosterTotal: number;
  benchEarningsZar: number;
  benchJobs: number;
  fleetCount: number;
}

export async function operatorInsights(operatorId: string): Promise<OperatorInsights> {
  const now = new Date();
  const [requests, rosterActive, rosterTotal, bench, fleetCount] = await Promise.all([
    db.crewRequest.findMany({ where: { operatorId }, select: { status: true, createdAt: true, filledAt: true, endsAt: true } }),
    db.crewRoster.count({ where: { operatorId, status: "ACTIVE" } }),
    db.crewRoster.count({ where: { operatorId } }),
    db.benchEarning.aggregate({ where: { operatorId }, _sum: { amountZar: true }, _count: true }),
    db.aircraft.count({ where: { operatorId } }),
  ]);

  const posted = requests.length;
  const filled = requests.filter((r) => r.status === "FILLED").length;
  const openRequests = requests.filter((r) => r.status === "OPEN" && r.endsAt >= now).length;
  const fillTimes = requests
    .filter((r) => r.status === "FILLED" && r.filledAt)
    .map((r) => (r.filledAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
  const avgTimeToFillHours = fillTimes.length ? Math.round((fillTimes.reduce((s, n) => s + n, 0) / fillTimes.length) * 10) / 10 : null;

  return {
    requestsPosted: posted,
    requestsFilled: filled,
    fillRate: posted > 0 ? filled / posted : 0,
    openRequests,
    avgTimeToFillHours,
    rosterActive,
    rosterTotal,
    benchEarningsZar: bench._sum.amountZar ?? 0,
    benchJobs: bench._count,
    fleetCount,
  };
}

export interface RosterPilot {
  rosterId: string;
  personId: string;
  fullName: string;
  homeAirfieldIcao: string | null;
  status: "INVITED" | "ACTIVE";
  sharedToPool: boolean;
  reputation: PilotReputation;
}

/** An operator's rostered pilots, each with reputation — the "list your pilots" view and the crew leaderboard source. */
export async function operatorRoster(operatorId: string): Promise<RosterPilot[]> {
  const roster = await db.crewRoster.findMany({
    where: { operatorId },
    include: { person: { select: { id: true, fullName: true, homeAirfieldIcao: true } } },
    orderBy: { createdAt: "asc" },
  });
  const reps = await computeReputations(roster.map((r) => r.person.id));
  return roster
    .map((r) => ({
      rosterId: r.id,
      personId: r.person.id,
      fullName: r.person.fullName,
      homeAirfieldIcao: r.person.homeAirfieldIcao,
      status: r.status,
      sharedToPool: r.sharedToPool,
      reputation: reps.get(r.person.id)!,
    }))
    .sort((a, b) => b.reputation.score - a.reputation.score);
}
