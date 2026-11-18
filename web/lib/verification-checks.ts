// Records verification checks (append-only) and reads a profile's current state. Not "server-only" so the
// nightly job (plain Node via tsx) can use it too.
import type { CheckSource, Prisma } from "@prisma/client";
import { db } from "./db";
import { nextBase, profileState, type CheckResult, type ComparedField, type ProfileState, type VerificationBase } from "./verification-state";

type Client = Prisma.TransactionClient | typeof db;

export interface CheckInput {
  source: CheckSource;
  result: CheckResult;
  credentialId?: string | null;
  fieldsCompared?: readonly ComparedField[] | null;
  error?: string | null;
  reviewer?: string | null;
  note?: string | null;
}

/**
 * Appends one check to the audit log and moves the profile's stored state accordingly, in one transaction.
 * PASS → VERIFIED (and stamps lastPassAt), MISMATCH → MISMATCH, RESET → UNVERIFIED, FAILED → unchanged.
 * Returns the stored base before and after, so callers can notify on a state change.
 */
export async function recordCheck(personId: string, check: CheckInput, client: typeof db = db): Promise<{ before: VerificationBase; after: VerificationBase }> {
  return client.$transaction(async (tx) => {
    const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, select: { verificationBase: true } });
    const now = new Date();
    await tx.verificationCheck.create({
      data: {
        personId,
        credentialId: check.credentialId ?? null,
        checkedAt: now,
        source: check.source,
        result: check.result,
        fieldsCompared: (check.fieldsCompared ?? undefined) as Prisma.InputJsonValue | undefined,
        error: check.error ?? null,
        reviewer: check.reviewer ?? null,
        note: check.note ?? null,
      },
    });
    const after = nextBase(person.verificationBase, check.result);
    await tx.person.update({
      where: { id: personId },
      data: {
        verificationBase: after,
        lastCheckAt: now,
        lastCheckResult: check.result,
        ...(check.result === "PASS" ? { lastPassAt: now } : {}),
      },
    });
    return { before: person.verificationBase, after };
  });
}

/** Everything needed to work out a profile's state, in one query shape (used by the wallet, search and /verify). */
export const PROFILE_STATE_SELECT = {
  verificationBase: true,
  lastPassAt: true,
  lastCheckAt: true,
  lastCheckResult: true,
  credentials: { select: { expiresAt: true, ratings: { select: { expiresAt: true } } } },
  medicals: { select: { expiresAt: true } },
} as const;

export interface PersonStateRow {
  verificationBase: VerificationBase;
  lastPassAt: Date | null;
  lastCheckAt: Date | null;
  lastCheckResult: CheckResult | null;
  credentials: { expiresAt: Date | null; ratings: { expiresAt: Date | null }[] }[];
  medicals: { expiresAt: Date | null }[];
}

export function stateOf(p: PersonStateRow, now: Date = new Date()): ProfileState {
  return profileState(
    {
      base: p.verificationBase,
      lastPassAt: p.lastPassAt,
      lastCheck: p.lastCheckAt && p.lastCheckResult ? { result: p.lastCheckResult, at: p.lastCheckAt } : null,
      expiries: [...p.credentials.flatMap((c) => [c.expiresAt, ...c.ratings.map((r) => r.expiresAt)]), ...p.medicals.map((m) => m.expiresAt)],
    },
    now,
  );
}

export async function loadProfileState(personId: string, client: Client = db): Promise<{ state: ProfileState; lastPassAt: Date | null } | null> {
  const p = await client.person.findUnique({ where: { id: personId }, select: PROFILE_STATE_SELECT });
  return p ? { state: stateOf(p), lastPassAt: p.lastPassAt } : null;
}
