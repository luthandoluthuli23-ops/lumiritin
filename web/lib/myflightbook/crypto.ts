/**
 * Crypto helpers for the logbook connection:
 *  - encryptSecret / decryptSecret: AES-256-GCM, for OAuth tokens stored in the database.
 *  - signPayload / verifyPayload: HMAC-signed, expiring blobs, for the OAuth `state` parameter.
 * Both keys are derived (HKDF-SHA256) from SESSION_SECRET with distinct labels, so neither equals the session-JWT key
 * and a value made for one purpose can't be replayed for another. There is deliberately NO fallback secret: without a
 * real SESSION_SECRET these throw. Rotating SESSION_SECRET invalidates stored tokens (pilots simply reconnect).
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

function key(label: string): Buffer {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  return Buffer.from(hkdfSync("sha256", secret, "lumiritin", label, 32));
}

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("token-encryption-v1"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64u(iv), b64u(cipher.getAuthTag()), b64u(ct)].join(".");
}

export function decryptSecret(blob: string): string {
  const [ver, iv, tag, ct] = blob.split(".");
  if (ver !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted token format");
  const decipher = createDecipheriv("aes-256-gcm", key("token-encryption-v1"), fromB64u(iv));
  decipher.setAuthTag(fromB64u(tag));
  return Buffer.concat([decipher.update(fromB64u(ct)), decipher.final()]).toString("utf8");
}

const mac = (body: string) => createHmac("sha256", key("oauth-state-v1")).update(body).digest();

/** Returns `<payload>.<signature>`; the payload carries its own expiry (`exp`, epoch ms). */
export function signPayload(data: Record<string, unknown>, ttlMs: number): string {
  const body = b64u(Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlMs }), "utf8"));
  return `${body}.${b64u(mac(body))}`;
}

export function verifyPayload<T extends Record<string, unknown>>(signed: string | undefined | null): T | null {
  if (!signed) return null;
  const [body, sig] = signed.split(".");
  if (!body || !sig) return null;
  const given = fromB64u(sig);
  const expected = mac(body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(fromB64u(body).toString("utf8")) as T & { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
