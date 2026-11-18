import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchSacaaLicence, type SacaaOutcome } from "@/lib/sacaa";
import { recordCheck } from "@/lib/verification-checks";
import { compareProfile, resultFromLookup } from "@/lib/verification-state";

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
    select: { id: true, personId: true, licenceNumber: true, licenceCategory: true, person: { select: { fullName: true } } },
  });
  if (!cred) return { outcome: "PORTAL_ERROR", verified: false, status: null, expires: null, error: "credential_not_found" };

  const res = await fetchSacaaLicence(cred.licenceNumber);
  const now = new Date();

  // Profile state + append-only audit log. Only a returned record whose compared fields all match is a PASS;
  // a failed, timed-out or blocked lookup is recorded as FAILED and can never verify a profile.
  const compared = res.outcome === "VERIFIED" && res.record
    ? compareProfile(
        { name: cred.person.fullName, licenceNumber: cred.licenceNumber, licenceType: cred.licenceCategory },
        { name: res.record.holder_name, licenceNumber: res.record.licence_number, licenceType: res.record.licence_type },
      )
    : null;
  const checkResult = resultFromLookup(res.record || res.outcome !== "VERIFIED" ? res.outcome : "PORTAL_ERROR", compared);
  await recordCheck(cred.personId, { source: "SACAA_PORTAL", result: checkResult, credentialId: cred.id, fieldsCompared: compared, error: res.error });

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
          lastVerificationMethod: "SACAA_PORTAL",
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
    // "verified" means the profile passed, not merely that SACAA returned a record (it may belong to someone else).
    return { outcome: "VERIFIED", verified: checkResult === "PASS", status: r.status ?? "Valid", expires: r.expires, error: null };
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

// Lumi no longer verifies anything on its own: it only pre-fills a reviewer's view (lib/pilot-verification.ts).
