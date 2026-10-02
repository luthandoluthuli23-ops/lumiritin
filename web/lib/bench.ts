// Bench monetisation policy: what an operator accrues when a pilot on its roster fills ANOTHER operator's request.
//
// BOTH numbers below are PLACEHOLDERS, not market data and not a commercial decision. Replace them with real
// rates before showing earnings to operators. Earnings are only ever "accrued": there is no payout system.

export const BENCH_SHARE_PERCENT = 15;

type CrewRoleKey = "PILOT" | "CABIN_CREW" | "AME" | "GROUND_CREW";

/** Assumed contract rate per hour in whole ZAR, by role. PLACEHOLDER. */
export const CREW_HOURLY_RATE_ZAR: Record<CrewRoleKey, number> = {
  PILOT: 3500,
  CABIN_CREW: 900,
  AME: 1200,
  GROUND_CREW: 500,
};

/** The lending operator's accrued share for a filled request: hours × role rate × share %. */
export function benchEarningZar(role: CrewRoleKey, hours: number): number {
  return Math.round((hours * CREW_HOURLY_RATE_ZAR[role] * BENCH_SHARE_PERCENT) / 100);
}
