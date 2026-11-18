// End-to-end verification flow against a real PostgreSQL (migrations applied). Runs only when TEST_DATABASE_URL points
// at a LOCAL throwaway database; it creates test rows and leaves them.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";

const url = process.env.TEST_DATABASE_URL;
const local = (() => {
  try {
    return url ? ["localhost", "127.0.0.1"].includes(new URL(url).hostname) : false;
  } catch {
    return false;
  }
})();

describe("pilot-triggered verification (database)", { skip: !local && "set TEST_DATABASE_URL to a local throwaway database" }, () => {
  // The lib modules use the shared client, so point it at the test database before importing them.
  let lib: typeof import("../lib/pilot-verification");
  let checks: typeof import("../lib/verification-checks");
  let db: typeof import("../lib/db").db;
  let personId: string;
  const DAY = 86_400_000;
  const jpeg = (label: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`photo ${label}`)]);
  const matchesAll = { name: true, licenceNumber: true, licenceType: true, licenceExpiry: true, medicalExpiry: true };

  before(async () => {
    process.env.DATABASE_URL = url;
    process.env.DOCUMENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    ({ db } = await import("../lib/db"));
    lib = await import("../lib/pilot-verification");
    checks = await import("../lib/verification-checks");
    const tag = randomUUID().slice(0, 8);
    const p = await db.person.create({
      data: { fullName: "Flow Pilot", email: `flow-${tag}@example.test`, credentials: { create: { type: "PILOT_LICENCE", licenceNumber: `FLW${tag}` } } },
      include: { credentials: true },
    });
    personId = p.id;
  });

  const submit = (licenceNumber: string) =>
    lib.createSubmission(
      personId,
      { holderName: "Flow Pilot", licenceNumber, licenceType: "CPL(H)", licenceExpiresAt: new Date(Date.now() + 400 * DAY).toISOString().slice(0, 10), medicalClass: 1, medicalExpiresAt: new Date(Date.now() + 300 * DAY).toISOString().slice(0, 10), ratings: ["H125"] },
      [
        { kind: "LICENCE", mediaType: "image/jpeg", bytes: jpeg("licence SECRET-LICENCE-TEXT") },
        { kind: "MEDICAL", mediaType: "image/jpeg", bytes: jpeg("medical") },
      ],
    );
  const licenceNo = async () => (await db.credential.findFirstOrThrow({ where: { personId } })).licenceNumber;

  it("a submission stores consent text + version + time, and encrypted documents", async () => {
    const id = await submit(await licenceNo());
    const sub = await db.verificationSubmission.findUniqueOrThrow({ where: { id }, include: { documents: true } });
    const consent = await db.consent.findUniqueOrThrow({ where: { id: sub.consentId! } });
    assert.equal(consent.textVersion, "verification-v1");
    assert.match(consent.text ?? "", /deleted 90 days after a decision/);
    assert.ok(consent.grantedAt instanceof Date);
    assert.equal(sub.documents.length, 2);
    for (const d of sub.documents) assert.ok(!Buffer.from(d.ciphertext).includes(Buffer.from("SECRET-LICENCE-TEXT")), "stored encrypted");
    assert.equal((await checks.loadProfileState(personId))?.state, "UNVERIFIED", "submitting alone verifies nothing");
  });

  it("'can't read' is FAILED and leaves the profile unverified", async () => {
    const sub = await db.verificationSubmission.findFirstOrThrow({ where: { personId, status: "PENDING" } });
    const r = await lib.decideSubmission(sub.id, "reviewer@example.test", "UNREADABLE", matchesAll, "blurry");
    assert.ok(r.ok && r.result === "FAILED");
    assert.equal((await checks.loadProfileState(personId))?.state, "UNVERIFIED");
  });

  it("a decided submission can't be decided again", async () => {
    const sub = await db.verificationSubmission.findFirstOrThrow({ where: { personId, status: "DECIDED" } });
    assert.deepEqual(await lib.decideSubmission(sub.id, "r2@example.test", "VERIFIED", matchesAll, null), { ok: false, error: "already_decided" });
  });

  it("a reviewer PASS verifies the profile, writes the checked details and logs who decided", async () => {
    const id = await submit(await licenceNo());
    const r = await lib.decideSubmission(id, "reviewer@example.test", "VERIFIED", matchesAll, null);
    assert.ok(r.ok && r.result === "PASS");
    const s = await checks.loadProfileState(personId);
    assert.equal(s?.state, "VERIFIED");
    const cred = await db.credential.findFirstOrThrow({ where: { personId }, include: { ratings: true } });
    assert.equal(cred.licenceCategory, "CPL(H)");
    assert.ok(cred.ratings.some((x) => x.name === "H125"));
    const last = await db.verificationCheck.findFirstOrThrow({ where: { personId }, orderBy: { checkedAt: "desc" } });
    assert.equal(last.source, "REVIEWER");
    assert.equal(last.reviewer, "reviewer@example.test");
    assert.ok(Array.isArray(last.fieldsCompared));
  });

  it("documents are deleted 90 days after the decision; the result and audit log stay", async () => {
    const decided = await db.verificationSubmission.findMany({ where: { personId, status: "DECIDED" }, select: { id: true } });
    const logBefore = await db.verificationCheck.count({ where: { personId } });
    assert.deepEqual(await lib.purgeExpiredDocuments(new Date(Date.now() + 89 * DAY), db), { submissions: 0, documents: 0 }, "not yet");
    const r = await lib.purgeExpiredDocuments(new Date(Date.now() + 91 * DAY), db);
    assert.ok(r.submissions >= decided.length && r.documents >= 2 * decided.length);
    assert.equal(await db.verificationDocument.count({ where: { submissionId: { in: decided.map((d) => d.id) } } }), 0);
    const kept = await db.verificationSubmission.findMany({ where: { id: { in: decided.map((d) => d.id) } } });
    assert.ok(kept.every((k) => k.decision && k.documentsPurgedAt), "decision kept, purge recorded");
    assert.equal(await db.verificationCheck.count({ where: { personId } }), logBefore, "audit log untouched");
  });

  it("nobody can review their own submission", async () => {
    const id = await submit(await licenceNo());
    const me = (await db.person.findUniqueOrThrow({ where: { id: personId } })).email;
    assert.deepEqual(await lib.decideSubmission(id, me.toUpperCase(), "VERIFIED", matchesAll, null), { ok: false, error: "own_submission" });
    assert.equal((await db.verificationSubmission.findUniqueOrThrow({ where: { id } })).status, "PENDING");
    await lib.decideSubmission(id, "reviewer@example.test", "MISMATCH", matchesAll, "test cleanup");
  });

  it("withdrawing consent resets to UNVERIFIED and deletes pending documents at once", async () => {
    const id = await submit(await licenceNo());
    const r = await lib.withdrawVerificationConsent(personId);
    assert.equal(r.withdrawnSubmissions, 1);
    assert.equal(await db.verificationDocument.count({ where: { submissionId: id } }), 0);
    assert.equal((await db.verificationSubmission.findUniqueOrThrow({ where: { id } })).status, "WITHDRAWN");
    assert.equal((await checks.loadProfileState(personId))?.state, "UNVERIFIED");
    assert.equal(await db.consent.count({ where: { personId, scope: "sacaa_verification", revokedAt: null } }), 0);
    const last = await db.verificationCheck.findFirstOrThrow({ where: { personId }, orderBy: { checkedAt: "desc" } });
    assert.equal(last.result, "RESET");
  });
});
