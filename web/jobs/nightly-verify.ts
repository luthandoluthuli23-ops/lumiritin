/**
 * Nightly re-verification of every pilot licence with active SACAA-verification consent.
 * Writes a verification_log row per credential and syncs ratings + medical.
 * Stops the whole run on BLOCKED so we never keep hitting a portal that is pushing back.
 */
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { runVerifier, type VerifiedRecord } from "../lib/verifier";

const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 5000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toDate = (iso: string | null) => (iso ? new Date(iso) : null);
const isoOrNull = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Change = { field: string; from: unknown; to: unknown };

async function syncCredential(credentialId: string, personId: string, rec: VerifiedRecord): Promise<Change[]> {
  const current = await db.credential.findUniqueOrThrow({
    where: { id: credentialId },
    include: { ratings: true },
  });
  const changes: Change[] = [];
  const cmp = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes.push({ field, from, to });
  };

  cmp("licenceCategory", current.licenceCategory, rec.licence_type);
  cmp("portalStatus", current.portalStatus, rec.status);
  cmp("holderNameOnRecord", current.holderNameOnRecord, rec.holder_name);
  cmp("issuedAt", isoOrNull(current.issuedAt), rec.issued);
  cmp("expiresAt", isoOrNull(current.expiresAt), rec.expires);

  const before = new Map(current.ratings.map((r) => [r.name, isoOrNull(r.expiresAt)]));
  const after = new Map(rec.ratings.map((r) => [r.name, r.expires]));
  for (const [name, exp] of after) {
    if (!before.has(name)) changes.push({ field: `rating:${name}`, from: null, to: exp });
    else if (before.get(name) !== exp) changes.push({ field: `rating:${name}`, from: before.get(name), to: exp });
  }
  for (const [name, exp] of before) {
    if (!after.has(name)) changes.push({ field: `rating:${name}`, from: exp, to: null });
  }

  await db.$transaction([
    db.credential.update({
      where: { id: credentialId },
      data: {
        licenceCategory: rec.licence_type,
        portalStatus: rec.status,
        holderNameOnRecord: rec.holder_name,
        issuedAt: toDate(rec.issued),
        expiresAt: toDate(rec.expires),
      },
    }),
    db.rating.deleteMany({
      where: { credentialId, source: "sacaa", name: { notIn: [...after.keys()] } },
    }),
    ...rec.ratings.map((r) =>
      db.rating.upsert({
        where: { credentialId_name: { credentialId, name: r.name } },
        create: { credentialId, name: r.name, category: r.category, expiresAt: toDate(r.expires) },
        update: { category: r.category, expiresAt: toDate(r.expires) },
      }),
    ),
    ...(rec.medical?.medical_class
      ? [
          db.medical.upsert({
            where: { personId_class: { personId, class: rec.medical.medical_class } },
            create: { personId, class: rec.medical.medical_class, expiresAt: toDate(rec.medical.expires) },
            update: { expiresAt: toDate(rec.medical.expires), source: "sacaa" },
          }),
        ]
      : []),
  ]);

  return changes;
}

async function main() {
  const credentials = await db.credential.findMany({
    where: {
      type: "PILOT_LICENCE",
      person: { consents: { some: { scope: "sacaa_verification", revokedAt: null } } },
    },
    orderBy: { lastVerifiedAt: { sort: "asc", nulls: "first" } },
  });
  console.log(`Verifying ${credentials.length} licence(s)`);

  const tally: Record<string, number> = {};
  for (const [i, cred] of credentials.entries()) {
    if (i > 0) await sleep(DELAY_MS);
    const result = await runVerifier(cred.licenceNumber);
    tally[result.outcome] = (tally[result.outcome] ?? 0) + 1;

    let changes: Change[] | undefined;
    if (result.outcome === "VERIFIED" && result.record) {
      changes = await syncCredential(cred.id, cred.personId, result.record);
    }

    await db.$transaction([
      db.verificationLog.create({
        data: {
          credentialId: cred.id,
          outcome: result.outcome,
          snapshot: (result.record ?? undefined) as Prisma.InputJsonValue | undefined,
          changes: changes as Prisma.InputJsonValue | undefined,
          htmlSha256: result.html_sha256,
          error: result.error,
        },
      }),
      db.credential.update({
        where: { id: cred.id },
        data: { lastVerifiedAt: new Date(), lastVerificationResult: result.outcome },
      }),
    ]);

    if (changes?.length) console.log(`${cred.licenceNumber}: ${changes.length} change(s)`);
    if (result.outcome === "BLOCKED") {
      console.error(`Portal blocked us (${result.error}). Stopping run.`);
      break;
    }
  }

  console.log("Done:", tally);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
