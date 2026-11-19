// Password-reset links without a database table. The token is `<userId>.<expiry>.<signature>`, where the signature is an
// HMAC (SESSION_SECRET) over the user id, the expiry AND the user's current password hash. So a link:
//   * expires after RESET_TTL_MS,
//   * stops working the moment the password changes (single use: using it changes the hash),
//   * can't be forged or pointed at another account without SESSION_SECRET.
import { createHmac, timingSafeEqual } from "node:crypto";

export const RESET_TTL_MS = 60 * 60_000; // 1 hour

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a string of at least 32 characters");
  return s;
}

const sign = (userId: string, exp: number, passwordHash: string) =>
  createHmac("sha256", secret()).update(`password-reset:${userId}:${exp}:${passwordHash}`).digest("base64url");

export function createResetToken(user: { id: string; passwordHash: string }, now = Date.now()): string {
  const exp = now + RESET_TTL_MS;
  return `${user.id}.${exp}.${sign(user.id, exp, user.passwordHash)}`;
}

/** Splits a token without trusting it. Null if malformed or expired. */
export function parseResetToken(token: string, now = Date.now()): { userId: string; exp: number; sig: string } | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(token.trim());
  if (!m) return null;
  const exp = Number(m[2]);
  if (!Number.isFinite(exp) || exp < now) return null;
  return { userId: m[1], exp, sig: m[3] };
}

/** True if the signature matches this user's CURRENT password hash. */
export function resetSignatureValid(p: { userId: string; exp: number; sig: string }, passwordHash: string): boolean {
  const want = Buffer.from(sign(p.userId, p.exp, passwordHash));
  const got = Buffer.from(p.sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
