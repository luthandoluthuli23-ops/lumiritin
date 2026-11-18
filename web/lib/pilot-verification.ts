// Pilot-triggered verification (the default path). SACAA's licensing portal sends an OTP to the holder, so we can't
// re-check silently in the background. Instead:
//   1. the pilot consents (text + version + time stored), enters their licence details and uploads photos of their
//      licence and medical certificate (encrypted at rest);
//   2. a reviewer compares the documents with the profile, field by field, and decides;
//   3. the decision is appended to the audit log and moves the profile's state;
//   4. document images are deleted 90 days after the decision (the result and audit log stay).
import { z } from "zod";
import type { DocumentKind, Prisma, ReviewDecision } from "@prisma/client";
import { db } from "./db";
import { encryptDocument, sha256Hex } from "./documents";
import { recordCheck } from "./verification-checks";
import { VERIFICATION_CONSENT_SCOPE, VERIFICATION_CONSENT_TEXT, VERIFICATION_CONSENT_VERSION } from "./verification-consent";
import type { CheckResult, ComparedField } from "./verification-state";

export const DOCUMENT_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

// ── Pure rules ────────────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const submissionSchema = z.object({
  holderName: z.string().trim().min(2).max(120),
  licenceNumber: z.string().trim().regex(/^[A-Za-z0-9-]{4,20}$/, "letters, digits and hyphens only"),
  licenceType: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
  licenceExpiresAt: isoDate,
  medicalClass: z.coerce.number().int().min(1).max(4).optional().or(z.literal("").transform(() => undefined)),
  medicalExpiresAt: isoDate,
  ratings: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 ()/.-]{0,30}$/)).max(20).default([]),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

export const COMPARED_FIELDS = ["name", "licenceNumber", "licenceType", "licenceExpiry", "medicalExpiry"] as const;
export type ComparedFieldName = (typeof COMPARED_FIELDS)[number];

/**
 * The audit result for a reviewer's decision. VERIFIED is only a PASS if the reviewer confirmed EVERY field matched;
 * otherwise it's downgraded to MISMATCH. UNREADABLE (couldn't be checked) is FAILED, never a pass.
 */
export function decisionToResult(decision: ReviewDecision, matches: Record<ComparedFieldName, boolean>): { decision: ReviewDecision; result: CheckResult } {
  if (decision === "UNREADABLE") return { decision, result: "FAILED" };
  if (decision === "MISMATCH") return { decision, result: "MISMATCH" };
  const allMatch = COMPARED_FIELDS.every((f) => matches[f] === true);
  return allMatch ? { decision: "VERIFIED", result: "PASS" } : { decision: "MISMATCH", result: "MISMATCH" };
}

/** Documents of submissions decided before this instant are due for deletion. */
export const retentionCutoff = (now: Date): Date => new Date(now.getTime() - DOCUMENT_RETENTION_DAYS * DAY_MS);

const toDate = (iso: string | undefined | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

// ── Database flows ────────────────────────────────────────────────────────────

export interface UploadedDocument {
  kind: DocumentKind;
  mediaType: string;
  bytes: Uint8Array;
}

/** Stores consent, the entered details and the encrypted documents. Returns the new submission id. */
export async function createSubmission(personId: string, input: SubmissionInput, docs: readonly UploadedDocument[]): Promise<string> {
  return db.$transaction(async (tx) => {
    const consent = await tx.consent.create({
      data: { personId, scope: VERIFICATION_CONSENT_SCOPE, textVersion: VERIFICATION_CONSENT_VERSION, text: VERIFICATION_CONSENT_TEXT },
    });
    const sub = await tx.verificationSubmission.create({
      data: {
        personId,
        consentId: consent.id,
        holderName: input.holderName,
        licenceNumber: input.licenceNumber,
        licenceType: input.licenceType ?? null,
        licenceExpiresAt: toDate(input.licenceExpiresAt),
        medicalClass: input.medicalClass ?? null,
        medicalExpiresAt: toDate(input.medicalExpiresAt),
        ratings: input.ratings,
      },
    });
    for (const d of docs) {
      await tx.verificationDocument.create({
        data: {
          submissionId: sub.id,
          kind: d.kind,
          mediaType: d.mediaType,
          sizeBytes: d.bytes.byteLength,
          sha256: sha256Hex(d.bytes),
          ciphertext: new Uint8Array(encryptDocument(d.bytes, sub.id, d.kind)),
        },
      });
    }
    return sub.id;
  });
}

export type DecideError = "not_found" | "already_decided" | "own_submission";

/**
 * Applies a reviewer's decision once (a second decision on the same submission is refused). On a PASS the details the
 * reviewer just confirmed (licence type and expiry, medical, ratings) are written to the profile first, so the
 * profile's expiry-driven state (EXPIRING / CHECK_OVERDUE) reflects what was checked.
 */
export async function decideSubmission(
  submissionId: string,
  reviewer: string,
  decisionIn: ReviewDecision,
  matches: Record<ComparedFieldName, boolean>,
  note: string | null,
): Promise<{ ok: true; result: CheckResult; personId: string; before: string; after: string } | { ok: false; error: DecideError }> {
  const sub = await db.verificationSubmission.findUnique({
    where: { id: submissionId },
    include: { person: { select: { fullName: true, email: true, credentials: true, user: { select: { email: true } } } } },
  });
  if (!sub) return { ok: false, error: "not_found" };
  if (sub.status !== "PENDING") return { ok: false, error: "already_decided" };
  // Nobody reviews their own documents.
  const own = [sub.person.email, sub.person.user?.email].filter(Boolean).map((e) => e!.toLowerCase());
  if (own.includes(reviewer.toLowerCase())) return { ok: false, error: "own_submission" };

  const { decision, result } = decisionToResult(decisionIn, matches);
  // Claim the submission first, so two reviewers can't both decide it.
  const claimed = await db.verificationSubmission.updateMany({
    where: { id: submissionId, status: "PENDING" },
    data: { status: "DECIDED", decision, decidedAt: new Date(), reviewer, reviewerNote: note },
  });
  if (claimed.count === 0) return { ok: false, error: "already_decided" };

  let cred = sub.person.credentials.find((c) => c.type === "PILOT_LICENCE") ?? sub.person.credentials[0];
  if (result === "PASS") {
    await db.$transaction(async (tx) => {
      // A pilot with no licence on file yet: the licence the reviewer just checked becomes their licence record.
      const credId =
        cred?.id ??
        (await tx.credential.create({
          data: { personId: sub.personId, type: "PILOT_LICENCE", licenceNumber: sub.licenceNumber, licenceCategory: sub.licenceType, expiresAt: sub.licenceExpiresAt },
        })).id;
      if (cred) {
        await tx.credential.update({
          where: { id: cred.id },
          data: { licenceCategory: sub.licenceType ?? undefined, expiresAt: sub.licenceExpiresAt ?? undefined },
        });
      }
      for (const name of sub.ratings) {
        await tx.rating.upsert({
          where: { credentialId_name: { credentialId: credId, name } },
          update: { source: "review" },
          create: { credentialId: credId, name, category: "Type", source: "review" },
        });
      }
      if (sub.medicalClass) {
        await tx.medical.upsert({
          where: { personId_class: { personId: sub.personId, class: sub.medicalClass } },
          update: { expiresAt: sub.medicalExpiresAt, source: "review" },
          create: { personId: sub.personId, class: sub.medicalClass, expiresAt: sub.medicalExpiresAt, source: "review" },
        });
      }
    });
    if (!cred) {
      const created = await db.credential.findFirst({ where: { personId: sub.personId, type: "PILOT_LICENCE" } });
      if (created) cred = created;
    }
  }

  const fieldsCompared: ComparedField[] = COMPARED_FIELDS.map((field) => ({
    field,
    profile: profileValue(field, sub.person.fullName, cred?.licenceNumber ?? null),
    record: submittedValue(field, sub),
    match: matches[field] === true,
  }));
  const moved = await recordCheck(sub.personId, {
    source: "REVIEWER",
    result,
    credentialId: cred?.id ?? null,
    fieldsCompared,
    reviewer,
    note: note ? `Submission ${sub.id}: ${note}` : `Submission ${sub.id}`,
  });
  return { ok: true, result, personId: sub.personId, before: moved.before, after: moved.after };
}

function profileValue(field: ComparedFieldName, name: string, licence: string | null): string | null {
  if (field === "name") return name;
  if (field === "licenceNumber") return licence;
  return null;
}
function submittedValue(field: ComparedFieldName, s: { holderName: string; licenceNumber: string; licenceType: string | null; licenceExpiresAt: Date | null; medicalExpiresAt: Date | null }): string | null {
  switch (field) {
    case "name":
      return s.holderName;
    case "licenceNumber":
      return s.licenceNumber;
    case "licenceType":
      return s.licenceType;
    case "licenceExpiry":
      return s.licenceExpiresAt?.toISOString().slice(0, 10) ?? null;
    case "medicalExpiry":
      return s.medicalExpiresAt?.toISOString().slice(0, 10) ?? null;
  }
}

/**
 * The pilot withdraws verification consent (Settings): revoke it, stop any pending review and delete its documents at
 * once, and reset the profile to UNVERIFIED (logged).
 */
export async function withdrawVerificationConsent(personId: string): Promise<{ revoked: number; withdrawnSubmissions: number }> {
  const now = new Date();
  const { revoked, withdrawn } = await db.$transaction(async (tx) => {
    const revoked = await tx.consent.updateMany({ where: { personId, scope: VERIFICATION_CONSENT_SCOPE, revokedAt: null }, data: { revokedAt: now } });
    const pending = await tx.verificationSubmission.findMany({ where: { personId, status: "PENDING" }, select: { id: true } });
    const ids = pending.map((p) => p.id);
    if (ids.length) {
      await tx.verificationDocument.deleteMany({ where: { submissionId: { in: ids } } });
      await tx.verificationSubmission.updateMany({ where: { id: { in: ids } }, data: { status: "WITHDRAWN", documentsPurgedAt: now } });
    }
    return { revoked: revoked.count, withdrawn: ids.length };
  });
  await recordCheck(personId, { source: "SYSTEM", result: "RESET", note: "Verification consent withdrawn by the pilot" });
  return { revoked, withdrawnSubmissions: withdrawn };
}

/** Retention job: deletes document images 90 days after a decision. Keeps the submission, its decision and the audit log. */
export async function purgeExpiredDocuments(now: Date = new Date(), client: typeof db = db): Promise<{ submissions: number; documents: number }> {
  const due = await client.verificationSubmission.findMany({
    where: { status: "DECIDED", decidedAt: { lt: retentionCutoff(now) }, documentsPurgedAt: null },
    select: { id: true },
  });
  if (due.length === 0) return { submissions: 0, documents: 0 };
  const ids = due.map((d) => d.id);
  const [deleted] = await client.$transaction([
    client.verificationDocument.deleteMany({ where: { submissionId: { in: ids } } }),
    client.verificationSubmission.updateMany({ where: { id: { in: ids } }, data: { documentsPurgedAt: now } }),
  ] as Prisma.PrismaPromise<{ count: number }>[]);
  return { submissions: ids.length, documents: deleted.count };
}
