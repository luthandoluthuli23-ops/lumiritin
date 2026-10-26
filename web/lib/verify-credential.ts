import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchSacaaLicence, type SacaaOutcome } from "@/lib/sacaa";
import type { LumiExtraction } from "@/lib/lumi";

// Dates from SACAA are plain yyyy-mm-dd (no time); anchor them to UTC midnight so @db.Date round-trips.
const toDate = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);

export interface VerifyResult {
  outcome: SacaaOutcome;
  /** True only when SACAA returned a matching record. */
  verified: boolean;
  /** Human-readable status now stored on the credential (e.g. "Valid", "Not found on SACAA"). */
  status: string | null;
  expires: string | null;
  error: string | null;
}

/**
 * Run a live SACAA check for one credential and persist the result.
 *  - VERIFIED: update licence status/category/expiry, merge SACAA ratings and medical, stamp lastVerifiedAt.
 *  - NOT_FOUND: mark the licence as not on SACAA (so self-declared numbers can't masquerade as verified).
 *  - BLOCKED / PORTAL_ERROR: record the attempt only; never overwrite a good stored status on a portal hiccup.
 * Always writes a VerificationLog. Safe to call repeatedly.
 */
export async function verifyCredential(credentialId: string): Promise<VerifyResult> {
  const cred = await db.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, personId: true, licenceNumber: true },
  });
  if (!cred) return { outcome: "PORTAL_ERROR", verified: false, status: null, expires: null, error: "credential_not_found" };

  const res = await fetchSacaaLicence(cred.licenceNumber);
  const now = new Date();

  if (res.outcome === "VERIFIED" && res.record) {
    const r = res.record;
    await db.$transaction(async (tx) => {
      await tx.credential.update({
        where: { id: cred.id },
        data: {
          portalStatus: r.status ?? "Valid",
          licenceCategory: r.licence_type ?? undefined,
          holderNameOnRecord: r.holder_name ?? undefined,
          issuedAt: toDate(r.issued) ?? undefined,
          expiresAt: toDate(r.expires) ?? undefined,
          lastVerifiedAt: now,
          lastVerificationResult: "VERIFIED",
        },
      });
      for (const rt of r.ratings) {
        await tx.rating.upsert({
          where: { credentialId_name: { credentialId: cred.id, name: rt.name } },
          update: { expiresAt: toDate(rt.expires) ?? undefined, source: "sacaa" },
          create: { credentialId: cred.id, name: rt.name, category: "Type", expiresAt: toDate(rt.expires), source: "sacaa" },
        });
      }
      if (r.medical && r.medical.medical_class != null) {
        await tx.medical.upsert({
          where: { personId_class: { personId: cred.personId, class: r.medical.medical_class } },
          update: { expiresAt: toDate(r.medical.expires) ?? undefined, source: "sacaa" },
          create: { personId: cred.personId, class: r.medical.medical_class, expiresAt: toDate(r.medical.expires), source: "sacaa" },
        });
      }
      await tx.verificationLog.create({
        data: { credentialId: cred.id, outcome: "VERIFIED", snapshot: r as unknown as Prisma.InputJsonValue },
      });
    });
    return { outcome: "VERIFIED", verified: true, status: r.status ?? "Valid", expires: r.expires, error: null };
  }

  if (res.outcome === "NOT_FOUND") {
    await db.$transaction([
      db.credential.update({
        where: { id: cred.id },
        data: { portalStatus: "Not found on SACAA", lastVerifiedAt: now, lastVerificationResult: "NOT_FOUND" },
      }),
      db.verificationLog.create({ data: { credentialId: cred.id, outcome: "NOT_FOUND" } }),
    ]);
    return { outcome: "NOT_FOUND", verified: false, status: "Not found on SACAA", expires: null, error: null };
  }

  // BLOCKED / PORTAL_ERROR — the portal, not the pilot, is the problem. Log it; leave the stored status alone.
  await db.$transaction([
    db.credential.update({ where: { id: cred.id }, data: { lastVerificationResult: res.outcome } }),
    db.verificationLog.create({ data: { credentialId: cred.id, outcome: res.outcome, error: res.error ?? undefined } }),
  ]);
  return { outcome: res.outcome, verified: false, status: null, expires: null, error: res.error };
}

// ── Lumi (document) verification ─────────────────────────────────────────────

const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** SACAA licence numbers often carry a leading 027; compare on the significant digits. */
function licenceDigitsMatch(a: string | null, b: string | null): boolean {
  let x = digitsOnly(a);
  let y = digitsOnly(b);
  if (!x || !y) return true; // nothing to contradict
  const strip027 = (v: string) => (v.startsWith("027") && v.length > 3 ? v.slice(3) : v);
  x = strip027(x);
  y = strip027(y);
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** Loose name match: at least one shared real name part (>=3 letters) between document and account. */
function nameMatches(docName: string | null, accountName: string | null): boolean {
  const toks = (s: string | null) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const doc = new Set(toks(docName));
  const acct = toks(accountName);
  if (doc.size === 0 || acct.length === 0) return false;
  const shared = acct.filter((t) => doc.has(t));
  return shared.some((t) => t.length >= 3);
}

export interface LumiApplyResult {
  verified: boolean;
  /** Reasons it was not auto-verified, for the uploader to act on. */
  reasons: string[];
  extraction: LumiExtraction;
}

const CONFIDENCE_FLOOR = 0.7;

/**
 * Apply a Lumi document extraction to a credential. Auto-verifies only when the document is the right
 * kind, legible/high-confidence, carries a licence number that matches what's on file, and the holder
 * name matches the account. Otherwise it changes nothing and returns the reasons, so the uploader can
 * fix the upload (clearer scan, correct document). Never fabricates data.
 */
export async function applyLumiExtraction(
  credentialId: string,
  extraction: LumiExtraction,
  opts: { expectedName?: string | null; declaredLicence?: string | null } = {},
): Promise<LumiApplyResult> {
  const reasons: string[] = [];
  if (!extraction.isExpectedDocument) reasons.push("This doesn't look like the expected licence document.");
  if (!extraction.licenceNumber) reasons.push("No licence number could be read from the document.");
  if (extraction.confidence < CONFIDENCE_FLOOR) reasons.push("The scan wasn't clear enough to verify confidently — try a sharper copy or the official SACAA PDF.");
  if (opts.expectedName && !nameMatches(extraction.holderName, opts.expectedName)) {
    reasons.push("The name on the document doesn't match your account name.");
  }
  if (opts.declaredLicence && extraction.licenceNumber && !licenceDigitsMatch(extraction.licenceNumber, opts.declaredLicence)) {
    reasons.push("The licence number on the document doesn't match the one on your profile.");
  }

  if (reasons.length > 0) return { verified: false, reasons, extraction };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.credential.update({
      where: { id: credentialId },
      data: {
        portalStatus: extraction.status ?? "Verified",
        licenceCategory: extraction.licenceType ?? undefined,
        holderNameOnRecord: extraction.holderName ?? undefined,
        issuedAt: toDate(extraction.issued) ?? undefined,
        expiresAt: toDate(extraction.expires) ?? undefined,
        lastVerifiedAt: now,
        lastVerificationResult: "VERIFIED",
      },
    });
    for (const rt of extraction.ratings) {
      await tx.rating.upsert({
        where: { credentialId_name: { credentialId, name: rt.name } },
        update: { expiresAt: toDate(rt.expires) ?? undefined, source: "lumi" },
        create: { credentialId, name: rt.name, category: "Type", expiresAt: toDate(rt.expires), source: "lumi" },
      });
    }
    if (extraction.medical && extraction.medical.class != null) {
      const cred = await tx.credential.findUnique({ where: { id: credentialId }, select: { personId: true } });
      if (cred) {
        await tx.medical.upsert({
          where: { personId_class: { personId: cred.personId, class: extraction.medical.class } },
          update: { expiresAt: toDate(extraction.medical.expires) ?? undefined, source: "lumi" },
          create: { personId: cred.personId, class: extraction.medical.class, expiresAt: toDate(extraction.medical.expires), source: "lumi" },
        });
      }
    }
    await tx.verificationLog.create({
      data: {
        credentialId,
        outcome: "VERIFIED",
        snapshot: { source: "lumi_document", ...extraction } as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return { verified: true, reasons: [], extraction };
}
