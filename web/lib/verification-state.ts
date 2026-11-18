// Profile verification states. Pure (no database), so the rules can be unit-tested directly.
//
// Every pilot profile is in exactly ONE of five states, in this order of precedence:
//   UNVERIFIED     never checked, consent withdrawn, or the name / licence number changed since the last check
//   MISMATCH       the last decisive check found the profile didn't match the SACAA documents / record
//   CHECK_OVERDUE  verified, but the last pass is older than 30 days, the latest check failed (lookup error, timeout,
//                  block), or a credential has already expired
//   EXPIRING       verified and current, but a licence, rating or medical expires within 60 days
//   VERIFIED       verified within 30 days, nothing failing, nothing expiring within 60 days
//
// A failed, timed-out or blocked lookup is NEVER a pass: it is recorded as FAILED, which can only ever lower a state.

export type ProfileState = "VERIFIED" | "EXPIRING" | "CHECK_OVERDUE" | "MISMATCH" | "UNVERIFIED";
export type VerificationBase = "UNVERIFIED" | "VERIFIED" | "MISMATCH";
export type CheckResult = "PASS" | "MISMATCH" | "FAILED" | "RESET";

export const RECHECK_AFTER_DAYS = 30;
export const EXPIRING_WITHIN_DAYS = 60;
const DAY_MS = 86_400_000;

/** States an operator's crew search may return. Everything else is excluded. */
export const SEARCHABLE_STATES: ReadonlySet<ProfileState> = new Set<ProfileState>(["VERIFIED", "EXPIRING"]);
export const isSearchable = (s: ProfileState): boolean => SEARCHABLE_STATES.has(s);

export interface ProfileFacts {
  base: VerificationBase;
  /** Last time a check PASSED. */
  lastPassAt: Date | null;
  /** The most recent check of any kind. */
  lastCheck: { result: CheckResult; at: Date } | null;
  /** Expiry dates of the licence, ratings and medicals on the profile (nulls = no expiry recorded). */
  expiries: readonly (Date | null)[];
}

export function profileState(f: ProfileFacts, now: Date): ProfileState {
  if (f.base === "UNVERIFIED") return "UNVERIFIED";
  if (f.base === "MISMATCH") return "MISMATCH";
  // base === VERIFIED from here on.
  if (!f.lastPassAt) return "CHECK_OVERDUE"; // can't be verified without a pass on record
  if (f.lastCheck && f.lastCheck.result === "FAILED" && f.lastCheck.at.getTime() >= f.lastPassAt.getTime()) return "CHECK_OVERDUE";
  if (now.getTime() - f.lastPassAt.getTime() > RECHECK_AFTER_DAYS * DAY_MS) return "CHECK_OVERDUE";
  const dated = f.expiries.filter((d): d is Date => d instanceof Date);
  if (dated.some((d) => d.getTime() <= now.getTime())) return "CHECK_OVERDUE"; // already expired: needs a new check
  if (dated.some((d) => d.getTime() - now.getTime() <= EXPIRING_WITHIN_DAYS * DAY_MS)) return "EXPIRING";
  return "VERIFIED";
}

/** How a check result moves the stored base. FAILED never changes it (and so can never make a profile verified). */
export function nextBase(current: VerificationBase, result: CheckResult): VerificationBase {
  switch (result) {
    case "PASS":
      return "VERIFIED";
    case "MISMATCH":
      return "MISMATCH";
    case "RESET":
      return "UNVERIFIED";
    case "FAILED":
      return current;
  }
}

// ── Comparing a profile with a SACAA record ───────────────────────────────────

export interface ComparedField {
  field: "name" | "licenceNumber" | "licenceType" | "licenceExpiry" | "medicalExpiry";
  profile: string | null;
  record: string | null;
  match: boolean;
}

const normName = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
const normLicence = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return d.startsWith("027") && d.length > 3 ? d.slice(3) : d; // SACAA numbers often carry a leading 027
};

/**
 * Field-by-field comparison. A field the record doesn't have counts as NOT matching (missing evidence is not a pass).
 * Names match when they contain the same words in any order (case, accents and punctuation ignored).
 */
export function compareProfile(
  profile: { name: string; licenceNumber: string; licenceType?: string | null },
  record: { name: string | null; licenceNumber: string | null; licenceType?: string | null },
): ComparedField[] {
  const fields: ComparedField[] = [
    { field: "name", profile: profile.name, record: record.name, match: !!record.name && normName(profile.name) === normName(record.name) },
    {
      field: "licenceNumber",
      profile: profile.licenceNumber,
      record: record.licenceNumber,
      match: !!record.licenceNumber && normLicence(profile.licenceNumber) === normLicence(record.licenceNumber),
    },
  ];
  if (profile.licenceType) {
    fields.push({
      field: "licenceType",
      profile: profile.licenceType,
      record: record.licenceType ?? null,
      match: !!record.licenceType && profile.licenceType.replace(/\s/g, "").toUpperCase() === record.licenceType.replace(/\s/g, "").toUpperCase(),
    });
  }
  return fields;
}

export type LookupOutcome = "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR" | "TIMEOUT";

/**
 * Turns a SACAA lookup into a check result. Only a returned record whose every compared field matches is a PASS.
 * NOT_FOUND is a decisive answer (the licence number isn't on SACAA) → MISMATCH. Anything else (error, block,
 * timeout, unknown) → FAILED.
 */
export function resultFromLookup(outcome: LookupOutcome | string, compared: readonly ComparedField[] | null): CheckResult {
  if (outcome === "VERIFIED") {
    if (!compared || compared.length === 0) return "FAILED"; // a "verified" response with nothing compared proves nothing
    return compared.every((f) => f.match) ? "PASS" : "MISMATCH";
  }
  if (outcome === "NOT_FOUND") return "MISMATCH";
  return "FAILED";
}

// ── Display ───────────────────────────────────────────────────────────────────

const BADGE_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });
/** "10 Nov 2026" */
export const formatBadgeDate = (d: Date): string => BADGE_DATE.format(d).replace("Sept", "Sep");

export const STATE_LABEL: Record<ProfileState, string> = {
  VERIFIED: "Verified",
  EXPIRING: "Expiring",
  CHECK_OVERDUE: "Check overdue",
  MISMATCH: "Mismatch",
  UNVERIFIED: "Unverified",
};

/** The sentence on a profile badge, e.g. "Verified against SACAA records on 10 Nov 2026". */
export function badgeText(state: ProfileState, lastPassAt: Date | null): string {
  const on = lastPassAt ? ` on ${formatBadgeDate(lastPassAt)}` : "";
  switch (state) {
    case "VERIFIED":
      return `Verified against SACAA records${on}`;
    case "EXPIRING":
      return `Verified against SACAA records${on} · a credential expires within ${EXPIRING_WITHIN_DAYS} days`;
    case "CHECK_OVERDUE":
      return lastPassAt ? `Check overdue · last verified against SACAA records${on}` : "Check overdue";
    case "MISMATCH":
      return "Details don't match SACAA records";
    case "UNVERIFIED":
      return "Not yet verified against SACAA records";
  }
}
