// Database-level guarantees for verification (Task 3), proven against a real PostgreSQL with the migrations applied.
// Runs only when TEST_DATABASE_URL points at a THROWAWAY database (never production): it creates and leaves test rows.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
const local = (() => {
  try {
    return url ? ["localhost", "127.0.0.1"].includes(new URL(url).hostname) : false;
  } catch {
    return false;
  }
})();

describe("verification audit log and resets (database)", { skip: !local && "set TEST_DATABASE_URL to a local throwaway database" }, () => {
  let db: PrismaClient;
  let personId: string;
  let credentialId: string;

  before(async () => {
    db = new PrismaClient({ datasourceUrl: url });
    const tag = randomUUID().slice(0, 8);
    const person = await db.person.create({
      data: {
        fullName: "Test Pilot",
        email: `verify-db-${tag}@example.test`,
        verificationBase: "VERIFIED",
        lastPassAt: new Date(),
        credentials: { create: { type: "PILOT_LICENCE", licenceNumber: `TST${tag}` } },
      },
      include: { credentials: true },
    });
    personId = person.id;
    credentialId = person.credentials[0].id;
  });
  after(async () => db?.$disconnect());

  const checks = () => db.verificationCheck.findMany({ where: { personId }, orderBy: { checkedAt: "asc" } });

  it("records can be added", async () => {
    await db.verificationCheck.create({ data: { personId, source: "REVIEWER", result: "PASS", reviewer: "reviewer@example.test" } });
    assert.equal((await checks()).length, 1);
  });

  it("earlier checks can never be updated", async () => {
    const [first] = await checks();
    await assert.rejects(db.verificationCheck.update({ where: { id: first.id }, data: { result: "FAILED" } }), /append-only/);
    await assert.rejects(db.$executeRawUnsafe(`UPDATE "verification_check" SET "note" = 'x' WHERE "personId" = $1`, personId), /append-only/);
    assert.equal((await checks())[0].result, "PASS");
  });

  it("earlier checks can never be deleted or truncated", async () => {
    const [first] = await checks();
    await assert.rejects(db.verificationCheck.delete({ where: { id: first.id } }), /append-only/);
    await assert.rejects(db.verificationCheck.deleteMany({ where: { personId } }), /append-only/);
    await assert.rejects(db.$executeRawUnsafe(`TRUNCATE "verification_check"`), /append-only/);
    assert.equal((await checks()).length, 1);
  });

  it("changing the name resets the profile to UNVERIFIED and logs it", async () => {
    await db.person.update({ where: { id: personId }, data: { verificationBase: "VERIFIED" } });
    await db.person.update({ where: { id: personId }, data: { fullName: "Test Pilot-Renamed" } });
    const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
    assert.equal(p.verificationBase, "UNVERIFIED");
    assert.ok((await checks()).some((c) => c.result === "RESET" && /Name changed/.test(c.note ?? "")));
  });

  it("changing the licence number resets the profile to UNVERIFIED and logs it", async () => {
    await db.person.update({ where: { id: personId }, data: { verificationBase: "VERIFIED" } });
    await db.credential.update({ where: { id: credentialId }, data: { licenceNumber: `NEW${randomUUID().slice(0, 8)}` } });
    const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
    assert.equal(p.verificationBase, "UNVERIFIED");
    assert.ok((await checks()).some((c) => c.result === "RESET" && c.credentialId === credentialId));
  });

  it("other profile edits don't reset anything", async () => {
    await db.person.update({ where: { id: personId }, data: { verificationBase: "VERIFIED" } });
    await db.person.update({ where: { id: personId }, data: { homeAirfieldIcao: "FALA", travelRadiusKm: 200 } });
    await db.credential.update({ where: { id: credentialId }, data: { portalStatus: "Valid" } });
    assert.equal((await db.person.findUniqueOrThrow({ where: { id: personId } })).verificationBase, "VERIFIED");
  });

  it("every person gets an unguessable public code", async () => {
    const p = await db.person.findUniqueOrThrow({ where: { id: personId } });
    assert.match(p.publicCode, /^[a-f0-9]{12}$/);
  });
});
