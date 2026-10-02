// Edge-safe session token (JWT, HS256). Imported by middleware.ts, so it must not use Node-only APIs.
import { SignJWT, jwtVerify } from "jose";
import { isRole, type Role } from "@/lib/roles";

export const SESSION_COOKIE = "lum_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  /** User id. */
  sub: string;
  role: Role;
  name: string;
}

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set to a string of at least 32 characters");
  return new TextEncoder().encode(secret);
}

export function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key());
}

/** Returns the payload for a valid, unexpired token, otherwise null. A missing SESSION_SECRET still throws. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  const secret = key();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !isRole(payload.role) || typeof payload.name !== "string") return null;
    return { sub: payload.sub, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}
