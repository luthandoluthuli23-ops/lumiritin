import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getMfbConfig } from "@/lib/myflightbook/config";
import { signPayload, verifyPayload } from "@/lib/myflightbook/crypto";

// ── Logbook "connect" bridges ────────────────────────────────────────────────
// A bridge pulls a pilot's flights from a third-party logbook over OAuth2, so nothing has to be uploaded. Only
// MyFlightbook publishes a usable pull API today (ForeFlight / LogTen are export-only: those go through the CSV or
// Lumi import instead). The protocol client lives in lib/myflightbook/*; the sync into the logbook in lib/logbook-sync.ts.

export const PROVIDERS = { myflightbook: { id: "myflightbook", name: "MyFlightbook" } } as const;
export type ProviderId = keyof typeof PROVIDERS;

export const isProvider = (id: string): id is ProviderId => Object.hasOwn(PROVIDERS, id);

/** True when the provider's client credentials are present and its endpoint settings are valid. */
export function providerConfigured(id: string): boolean {
  if (id !== "myflightbook") return false;
  try {
    return getMfbConfig() !== null;
  } catch {
    return false;
  }
}

/** Public origin used for the OAuth redirect URI and post-login redirects. Set APP_BASE_URL in production. */
export const appOrigin = (req: NextRequest): string => (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/$/, "");

/** Must match, exactly (host, port and path), a callback registered for the client with the provider. */
export const redirectUri = (origin: string, id: string): string => `${origin.replace(/\/$/, "")}/api/logbook/connect/${id}/callback`;

// ── OAuth `state` (CSRF + login-CSRF protection) ─────────────────────────────
// The state sent to the provider is HMAC-signed and carries a random nonce. The same nonce is set in a short-lived
// httpOnly cookie on this browser. The callback accepts only a state that is (a) validly signed and unexpired, (b) for
// the same provider, and (c) matches the nonce cookie, so a link crafted by someone else can't be completed in this
// browser. The pilot's identity comes from the session, never from the URL.

export const NONCE_COOKIE = "lum_oauth_nonce";
export const STATE_TTL_MS = 15 * 60_000;

export function newOAuthState(providerId: ProviderId): { state: string; nonce: string } {
  const nonce = randomBytes(18).toString("base64url");
  return { state: signPayload({ v: providerId, n: nonce }, STATE_TTL_MS), nonce };
}

export function checkOAuthState(state: string | null | undefined, nonceCookie: string | null | undefined, providerId: ProviderId): boolean {
  const payload = verifyPayload<{ v: string; n: string }>(state);
  if (!payload || payload.v !== providerId || typeof payload.n !== "string" || !nonceCookie) return false;
  const a = Buffer.from(payload.n);
  const b = Buffer.from(nonceCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}
