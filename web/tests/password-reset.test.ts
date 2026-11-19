import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { createResetToken, parseResetToken, RESET_TTL_MS, resetSignatureValid } from "../lib/password-reset";

const ROOT = join(__dirname, "..");
before(() => {
  process.env.SESSION_SECRET ??= "x".repeat(40);
});

const user = { id: "cmabc123def456", passwordHash: "scrypt$old" };
const now = 1_800_000_000_000;

describe("password reset tokens", () => {
  it("a fresh token verifies against the same password hash", () => {
    const t = parseResetToken(createResetToken(user, now), now + 1000);
    assert.ok(t);
    assert.equal(t.userId, user.id);
    assert.equal(resetSignatureValid(t, user.passwordHash), true);
  });

  it("stops working once the password has changed (single use)", () => {
    const t = parseResetToken(createResetToken(user, now), now)!;
    assert.equal(resetSignatureValid(t, "scrypt$new"), false);
  });

  it("expires after an hour", () => {
    const token = createResetToken(user, now);
    assert.ok(parseResetToken(token, now + RESET_TTL_MS - 1));
    assert.equal(parseResetToken(token, now + RESET_TTL_MS + 1), null);
  });

  it("rejects tampering: another user id, a later expiry, junk", () => {
    const [, exp, sig] = createResetToken(user, now).split(".");
    const other = parseResetToken(`someoneelse1.${exp}.${sig}`, now)!;
    assert.equal(resetSignatureValid(other, user.passwordHash), false);
    const later = parseResetToken(`${user.id}.${Number(exp) + 9_999_999}.${sig}`, now)!;
    assert.equal(resetSignatureValid(later, user.passwordHash), false);
    for (const junk of ["", "abc", "a.b.c", `${user.id}.${exp}`]) assert.equal(parseResetToken(junk, now), null);
  });

  it("the sign-in page links to the forgot-password page, and both pages exist", () => {
    assert.match(readFileSync(join(ROOT, "app/auth/signin/page.tsx"), "utf8"), /href="\/auth\/forgot"/);
    for (const p of ["app/auth/forgot/page.tsx", "app/auth/reset/page.tsx", "app/api/auth/forgot/route.ts", "app/api/auth/reset/route.ts"]) {
      assert.ok(existsSync(join(ROOT, p)), p);
    }
  });

  it("the forgot route answers the same whether or not the account exists", () => {
    const src = readFileSync(join(ROOT, "app/api/auth/forgot/route.ts"), "utf8");
    // The lookup happens only inside after(), so the response can't depend on it.
    assert.match(src, /after\(async \(\) => \{\s*const user = await db\.user\.findUnique/);
  });
});
