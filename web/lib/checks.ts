// Recurrent pilot checks (SACAA / SA-CATS 61 & Part 121/135). A record stores the facts; its
// currency STATUS is derived from the expiry date at read time, so it is always up to date.

export interface CheckType {
  code: string;
  label: string;
  /** Typical validity in months (guidance only; the stored expiry date is authoritative). */
  typicalValidityMonths: number;
}

export const CHECK_TYPES: readonly CheckType[] = [
  { code: "PPC", label: "Pilot Proficiency Check (PPC)", typicalValidityMonths: 12 },
  { code: "OPC", label: "Operator Proficiency Check (OPC)", typicalValidityMonths: 6 },
  { code: "IR", label: "Instrument Rating revalidation", typicalValidityMonths: 12 },
  { code: "TYPE", label: "Type Rating revalidation", typicalValidityMonths: 12 },
  { code: "LINE", label: "Line Check", typicalValidityMonths: 12 },
  { code: "BASE", label: "Base Check", typicalValidityMonths: 6 },
  { code: "SKILLS", label: "Skills Test (initial)", typicalValidityMonths: 12 },
];

export const CHECK_TYPE_LABEL: Record<string, string> = Object.fromEntries(CHECK_TYPES.map((c) => [c.code, c.label]));
export const CHECK_TYPE_CODES = CHECK_TYPES.map((c) => c.code) as [string, ...string[]];

export type CheckStatus = "CURRENT" | "DUE_SOON" | "EXPIRED";

/** Days before expiry at which a check is flagged "Due soon". */
export const DUE_SOON_DAYS = 30;

export interface CheckStatusInfo {
  status: CheckStatus;
  label: string;
  tone: "green" | "amber" | "red";
  daysLeft: number;
}

/** Derive currency from the expiry date. `now` is injectable for testing. */
export function checkStatus(expiresAt: Date, now: Date = new Date()): CheckStatusInfo {
  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return { status: "EXPIRED", label: "Expired", tone: "red", daysLeft };
  if (daysLeft <= DUE_SOON_DAYS) return { status: "DUE_SOON", label: `Due in ${daysLeft}d`, tone: "amber", daysLeft };
  return { status: "CURRENT", label: "Current", tone: "green", daysLeft };
}
