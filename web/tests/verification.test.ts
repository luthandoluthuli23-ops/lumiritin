import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchPilots, type CandidateInput, type MatchRequest } from "../lib/matching";
import {
  badgeText,
  compareProfile,
  isSearchable,
  nextBase,
  profileState,
  resultFromLookup,
  type CheckResult,
  type ProfileFacts,
  type ProfileState,
  type VerificationBase,
} from "../lib/verification-state";

const NOW = new Date("2026-11-18T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const facts = (f: Partial<ProfileFacts>): ProfileFacts => ({ base: "VERIFIED", lastPassAt: daysAgo(3), lastCheck: { result: "PASS", at: daysAgo(3) }, expiries: [inDays(400)], ...f });

describe("profile states", () => {
  it("each profile has exactly one of the five states", () => {
    const all: ProfileState[] = [];
    for (const base of ["UNVERIFIED", "VERIFIED", "MISMATCH"] as const)
      for (const pass of [null, daysAgo(1), daysAgo(45)])
        for (const last of [null, "PASS", "FAILED", "MISMATCH", "RESET"] as const)
          for (const exp of [[inDays(400)], [inDays(20)], [daysAgo(1)], [null]])
            all.push(profileState({ base, lastPassAt: pass, lastCheck: last ? { result: last, at: daysAgo(0.5) } : null, expiries: exp }, NOW));
    for (const s of all) assert.ok(["VERIFIED", "EXPIRING", "CHECK_OVERDUE", "MISMATCH", "UNVERIFIED"].includes(s));
  });

  it("VERIFIED: passed within 30 days, nothing failing, nothing expiring within 60 days", () => {
    assert.equal(profileState(facts({}), NOW), "VERIFIED");
    assert.equal(profileState(facts({ expiries: [inDays(61), null] }), NOW), "VERIFIED");
  });

  it("EXPIRING: verified, but a licence, rating or medical expires within 60 days", () => {
    assert.equal(profileState(facts({ expiries: [inDays(400), inDays(60)] }), NOW), "EXPIRING");
    assert.equal(profileState(facts({ expiries: [inDays(1)] }), NOW), "EXPIRING");
  });

  it("CHECK_OVERDUE: last pass older than 30 days, or the latest check failed, or something already expired", () => {
    assert.equal(profileState(facts({ lastPassAt: daysAgo(31), lastCheck: { result: "PASS", at: daysAgo(31) } }), NOW), "CHECK_OVERDUE");
    assert.equal(profileState(facts({ lastCheck: { result: "FAILED", at: daysAgo(1) } }), NOW), "CHECK_OVERDUE");
    assert.equal(profileState(facts({ expiries: [daysAgo(1)] }), NOW), "CHECK_OVERDUE");
    assert.equal(profileState(facts({ lastPassAt: null, lastCheck: null }), NOW), "CHECK_OVERDUE");
  });

  it("a failure BEFORE the latest pass doesn't count against it", () => {
    assert.equal(profileState(facts({ lastPassAt: daysAgo(2), lastCheck: { result: "FAILED", at: daysAgo(5) } }), NOW), "VERIFIED");
  });

  it("MISMATCH and UNVERIFIED win over everything else", () => {
    assert.equal(profileState(facts({ base: "MISMATCH" }), NOW), "MISMATCH");
    assert.equal(profileState(facts({ base: "UNVERIFIED" }), NOW), "UNVERIFIED");
  });
});

describe("a failed, timed-out or blocked lookup is NEVER a pass", () => {
  const failures = ["BLOCKED", "PORTAL_ERROR", "TIMEOUT", "", "SOMETHING_NEW", "verified"];

  it("lookup outcomes other than a fully matching record map to FAILED (or MISMATCH for not-found)", () => {
    for (const o of failures) assert.equal(resultFromLookup(o, null), "FAILED", o);
    assert.equal(resultFromLookup("NOT_FOUND", null), "MISMATCH");
    // A "VERIFIED" response with nothing to compare proves nothing.
    assert.equal(resultFromLookup("VERIFIED", null), "FAILED");
    assert.equal(resultFromLookup("VERIFIED", []), "FAILED");
  });

  it("FAILED never moves the stored state, so it can never verify a profile", () => {
    for (const base of ["UNVERIFIED", "MISMATCH", "VERIFIED"] as VerificationBase[]) assert.equal(nextBase(base, "FAILED"), base);
  });

  it("any number of failed lookups leave an unverified profile unverified and unsearchable", () => {
    let base: VerificationBase = "UNVERIFIED";
    let lastPassAt: Date | null = null;
    for (let i = 0; i < 50; i++) {
      const r = resultFromLookup(failures[i % failures.length], null);
      base = nextBase(base, r);
      if (r === "PASS") lastPassAt = NOW;
      const s = profileState({ base, lastPassAt, lastCheck: { result: r, at: NOW }, expiries: [inDays(400)] }, NOW);
      assert.equal(s, "UNVERIFIED");
      assert.equal(isSearchable(s), false);
    }
  });

  it("a failed re-check knocks a verified profile out of crew search (CHECK_OVERDUE)", () => {
    const s = profileState(facts({ lastCheck: { result: "FAILED", at: NOW } }), NOW);
    assert.equal(s, "CHECK_OVERDUE");
    assert.equal(isSearchable(s), false);
  });

  it("a record that doesn't match the profile is a MISMATCH, not a pass", () => {
    const compared = compareProfile({ name: "Thandi Nkosi", licenceNumber: "0271234567" }, { name: "Someone Else", licenceNumber: "0271234567" });
    assert.equal(resultFromLookup("VERIFIED", compared), "MISMATCH");
  });

  it("only a record whose every compared field matches is a PASS", () => {
    const compared = compareProfile(
      { name: "Thandi  Nkosi", licenceNumber: "0271234567", licenceType: "CPL(A)" },
      { name: "NKOSI, THANDI", licenceNumber: "1234567", licenceType: "CPL (A)" },
    );
    assert.ok(compared.every((f) => f.match), JSON.stringify(compared));
    assert.equal(resultFromLookup("VERIFIED", compared), "PASS");
  });

  it("a field missing from the record is not evidence of a match", () => {
    const compared = compareProfile({ name: "Thandi Nkosi", licenceNumber: "0271234567" }, { name: null, licenceNumber: "0271234567" });
    assert.equal(compared.find((f) => f.field === "name")?.match, false);
    assert.equal(resultFromLookup("VERIFIED", compared), "MISMATCH");
  });
});

describe("state transitions", () => {
  it("PASS verifies, MISMATCH flags, RESET (name/licence change, consent withdrawn) unverifies", () => {
    const cases: [VerificationBase, CheckResult, VerificationBase][] = [
      ["UNVERIFIED", "PASS", "VERIFIED"],
      ["MISMATCH", "PASS", "VERIFIED"],
      ["VERIFIED", "MISMATCH", "MISMATCH"],
      ["VERIFIED", "RESET", "UNVERIFIED"],
      ["MISMATCH", "RESET", "UNVERIFIED"],
    ];
    for (const [from, r, to] of cases) assert.equal(nextBase(from, r), to, `${from} + ${r}`);
  });
});

describe("badge text", () => {
  it("reads 'Verified against SACAA records on 10 Nov 2026'", () => {
    assert.equal(badgeText("VERIFIED", new Date("2026-11-10T08:00:00Z")), "Verified against SACAA records on 10 Nov 2026");
  });
  it("never claims verification for unverified or mismatched profiles", () => {
    assert.doesNotMatch(badgeText("UNVERIFIED", null), /^Verified/);
    assert.doesNotMatch(badgeText("MISMATCH", new Date("2026-11-10T08:00:00Z")), /^Verified/);
  });
});

// ── Operator crew search ──────────────────────────────────────────────────────

const JOB = { start: inDays(5), end: new Date(inDays(5).getTime() + 4 * 3_600_000) };
const REQ: MatchRequest = {
  operatorId: "op1",
  role: "PILOT",
  requiredTypes: [],
  departure: { lat: -25.94, lng: 27.93 },
  startsAt: JOB.start,
  endsAt: JOB.end,
  minTotalHours: null,
  requesterContributesToPool: false,
  now: NOW,
};

function candidate(id: string, profileState: ProfileState): CandidateInput {
  return {
    personId: id,
    name: `Pilot ${id}`,
    homeIcao: "FALA",
    homeCoords: { lat: -25.94, lng: 27.93 },
    travelRadiusKm: null,
    ratings: [],
    licence: { expiresAt: inDays(400), portalStatus: "Valid", lastVerificationResult: "VERIFIED", lastVerificationMethod: "SACAA_PORTAL", lastVerifiedAt: daysAgo(2) },
    medicals: [{ class: 1, expiresAt: inDays(300) }],
    totalHours: 1500,
    windows: [{ state: "AVAILABLE", startsAt: daysAgo(1), endsAt: inDays(6) }],
    rosterOperatorIds: [],
    sharedToPool: false,
    profileState,
    lastPassAt: profileState === "UNVERIFIED" ? null : daysAgo(2),
  };
}

describe("operator crew search returns only VERIFIED and EXPIRING profiles", () => {
  const states: ProfileState[] = ["VERIFIED", "EXPIRING", "CHECK_OVERDUE", "MISMATCH", "UNVERIFIED"];
  const result = matchPilots(states.map((s) => candidate(s, s)), REQ);

  it("returns exactly the VERIFIED and EXPIRING candidates", () => {
    assert.deepEqual(result.ranked.map((m) => m.personId).sort(), ["EXPIRING", "VERIFIED"]);
  });

  it("excludes the others with a stated reason", () => {
    for (const s of ["CHECK_OVERDUE", "MISMATCH", "UNVERIFIED"]) {
      const ex = result.excluded.find((e) => e.personId === s);
      assert.ok(ex, s);
      assert.ok(JSON.stringify(ex).includes("PROFILE_NOT_VERIFIED"), s);
    }
  });

  it("an otherwise perfect but unverified pilot is never returned", () => {
    const r = matchPilots([candidate("only", "UNVERIFIED")], REQ);
    assert.equal(r.ranked.length, 0);
  });

  it("each returned pilot carries the dated SACAA badge", () => {
    const v = result.ranked.find((m) => m.personId === "VERIFIED")!;
    const badge = v.badges.find((b) => b.label === "Credential")!;
    assert.match(badge.value, /^Verified against SACAA records on \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});
