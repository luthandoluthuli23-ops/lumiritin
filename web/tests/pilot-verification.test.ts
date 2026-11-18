import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { decryptDocument, DocumentKeyError, encryptDocument, isDocumentStorageConfigured, sniffDocumentType } from "../lib/documents";
import { COMPARED_FIELDS, decisionToResult, DOCUMENT_RETENTION_DAYS, retentionCutoff, submissionSchema } from "../lib/pilot-verification";
import { isOtpRelayEnabled, OtpRelayUnavailableError, completeLookup, startLookup } from "../lib/sacaa-otp-relay";
import { VERIFICATION_CONSENT_TEXT, VERIFICATION_CONSENT_VERSION } from "../lib/verification-consent";

import { isReviewerEmail } from "../lib/reviewer-allowlist";

// lib/reviewers.ts is server-only (it reads the session); check it uses the tested allowlist.
const reviewersSrc = readFileSync(join(__dirname, "../lib/reviewers.ts"), "utf8");

const KEY = randomBytes(32).toString("base64");
const allTrue = Object.fromEntries(COMPARED_FIELDS.map((f) => [f, true])) as Record<(typeof COMPARED_FIELDS)[number], boolean>;

describe("document encryption at rest", () => {
  beforeEach(() => (process.env.DOCUMENT_ENCRYPTION_KEY = KEY));
  afterEach(() => delete process.env.DOCUMENT_ENCRYPTION_KEY);
  const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("JFIF licence photo of Test Pilot 0270000001")]);

  it("round-trips, and the stored bytes never contain the plaintext", () => {
    const blob = encryptDocument(photo, "sub1", "LICENCE");
    assert.ok(!blob.includes(Buffer.from("0270000001")));
    assert.ok(!blob.includes(Buffer.from("Test Pilot")));
    assert.deepEqual(decryptDocument(blob, "sub1", "LICENCE"), photo);
  });

  it("each encryption is different (random IV)", () => {
    assert.notDeepEqual(encryptDocument(photo, "sub1", "LICENCE"), encryptDocument(photo, "sub1", "LICENCE"));
  });

  it("a tampered blob, or one moved to another submission or kind, can't be opened", () => {
    const blob = encryptDocument(photo, "sub1", "LICENCE");
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 0x01;
    assert.throws(() => decryptDocument(tampered, "sub1", "LICENCE"));
    assert.throws(() => decryptDocument(blob, "sub2", "LICENCE"));
    assert.throws(() => decryptDocument(blob, "sub1", "MEDICAL"));
  });

  it("a different key can't open it", () => {
    const blob = encryptDocument(photo, "sub1", "LICENCE");
    process.env.DOCUMENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    assert.throws(() => decryptDocument(blob, "sub1", "LICENCE"));
  });

  it("refuses to store anything without a proper key (no fallback)", () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    assert.equal(isDocumentStorageConfigured(), false);
    assert.throws(() => encryptDocument(photo, "s", "LICENCE"), DocumentKeyError);
    process.env.DOCUMENT_ENCRYPTION_KEY = "too-short";
    assert.throws(() => encryptDocument(photo, "s", "LICENCE"), DocumentKeyError);
    process.env.DOCUMENT_ENCRYPTION_KEY = "ab".repeat(32); // 64 hex chars is accepted too
    assert.equal(isDocumentStorageConfigured(), true);
  });

  it("checks file contents, not just the name or declared type", () => {
    assert.equal(sniffDocumentType(photo), "image/jpeg");
    assert.equal(sniffDocumentType(Buffer.from("%PDF-1.7 ...")), "application/pdf");
    assert.equal(sniffDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(sniffDocumentType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
    assert.equal(sniffDocumentType(Buffer.from("<svg onload=alert(1)>")), null);
    assert.equal(sniffDocumentType(Buffer.from("MZ executable")), null);
  });
});

describe("reviewer decisions", () => {
  it("VERIFIED is a PASS only when every field was confirmed", () => {
    assert.deepEqual(decisionToResult("VERIFIED", allTrue), { decision: "VERIFIED", result: "PASS" });
    for (const f of COMPARED_FIELDS) {
      assert.deepEqual(decisionToResult("VERIFIED", { ...allTrue, [f]: false }), { decision: "MISMATCH", result: "MISMATCH" }, f);
    }
  });

  it("'can't read / wrong document' is FAILED, never a pass, even if boxes were ticked", () => {
    assert.deepEqual(decisionToResult("UNREADABLE", allTrue), { decision: "UNREADABLE", result: "FAILED" });
  });

  it("MISMATCH stays MISMATCH", () => {
    assert.deepEqual(decisionToResult("MISMATCH", allTrue), { decision: "MISMATCH", result: "MISMATCH" });
  });
});

describe("reviewer access", () => {
  it("is an email allowlist (REVIEWER_EMAILS), case-insensitive, empty = nobody", () => {
    assert.match(reviewersSrc, /isReviewerEmail\(user\.email\)/);
    assert.equal(isReviewerEmail("Admin@Example.test", "admin@example.test, other@example.test"), true);
    assert.equal(isReviewerEmail("someone@example.test", "admin@example.test"), false);
    assert.equal(isReviewerEmail("admin@example.test", ""), false);
    assert.equal(isReviewerEmail("admin@example.test", undefined), false);
    assert.equal(isReviewerEmail(null, "admin@example.test"), false);
  });

  it("documents and the queue are reviewer-only (404/403 for everyone else)", () => {
    const docRoute = readFileSync(join(__dirname, "../app/api/admin/documents/[id]/route.ts"), "utf8");
    assert.match(docRoute, /const reviewer = await getReviewer\(\);\s*if \(!reviewer\) return new NextResponse\("Not found", \{ status: 404 \}\)/);
    assert.match(docRoute, /no-store/);
    for (const p of ["../app/admin/review/page.tsx", "../app/admin/review/[id]/page.tsx"]) {
      assert.match(readFileSync(join(__dirname, p), "utf8"), /if \(!reviewer\) notFound\(\)/, p);
    }
    assert.match(readFileSync(join(__dirname, "../app/api/admin/review/[id]/route.ts"), "utf8"), /if \(!reviewer\) return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\)/);
  });
});

describe("SACAA OTP relay", () => {
  afterEach(() => delete process.env.SACAA_OTP_RELAY);

  it("is OFF by default", async () => {
    delete process.env.SACAA_OTP_RELAY;
    assert.equal(isOtpRelayEnabled(), false);
    await assert.rejects(startLookup("0270000001"), (e: Error) => e instanceof OtpRelayUnavailableError && /switched off/.test(e.message));
    await assert.rejects(completeLookup("s", "123456"), OtpRelayUnavailableError);
  });

  it("even when switched on, the portal client refuses (not implemented)", async () => {
    process.env.SACAA_OTP_RELAY = "true";
    await assert.rejects(startLookup("0270000001"), (e: Error) => /not implemented/.test(e.message));
  });

  it("carries the legal-review warning and the route 404s while off", () => {
    const lib = readFileSync(join(__dirname, "../lib/sacaa-otp-relay.ts"), "utf8");
    assert.match(lib, /DO NOT ENABLE[\s\S]*legal review of SACAA's terms of use/);
    const route = readFileSync(join(__dirname, "../app/api/pilot/verification/otp/route.ts"), "utf8");
    assert.match(route, /if \(!isOtpRelayEnabled\(\)\) return NextResponse\.json\(\{ error: "not_found" \}, \{ status: 404 \}\)/);
  });
});

describe("consent and retention", () => {
  it("consent has stored text and a version", () => {
    assert.match(VERIFICATION_CONSENT_VERSION, /^verification-v\d+$/);
    assert.match(VERIFICATION_CONSENT_TEXT, /withdraw/);
    assert.match(VERIFICATION_CONSENT_TEXT, /deleted 90 days after a decision/);
  });

  it("documents are due for deletion 90 days after the decision", () => {
    assert.equal(DOCUMENT_RETENTION_DAYS, 90);
    const now = new Date("2026-11-18T00:00:00Z");
    assert.equal(retentionCutoff(now).toISOString(), "2026-08-20T00:00:00.000Z");
  });

  it("validates what the pilot enters", () => {
    assert.equal(submissionSchema.safeParse({ holderName: "T", licenceNumber: "0270000001" }).success, false);
    assert.equal(submissionSchema.safeParse({ holderName: "Test Pilot", licenceNumber: "02712; DROP" }).success, false);
    const ok = submissionSchema.safeParse({ holderName: "Test Pilot", licenceNumber: "0270000001", medicalClass: "1", licenceExpiresAt: "2027-03-14", ratings: ["h125"] });
    assert.equal(ok.success, true);
    assert.deepEqual(ok.success && ok.data.ratings, ["H125"]);
  });
});
