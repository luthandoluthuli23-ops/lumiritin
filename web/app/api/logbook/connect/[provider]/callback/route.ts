import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { NONCE_COOKIE, appOrigin, checkOAuthState, isProvider, redirectUri } from "@/lib/logbook-connect";
import { saveConnection, syncMyFlightbook } from "@/lib/logbook-sync";
import { exchangeCode } from "@/lib/myflightbook/client";
import { getMfbConfig } from "@/lib/myflightbook/config";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the first import of a long logbook runs inline

const CONSENT_SCOPE = "myflightbook_import";
const CONSENT_TEXT_VERSION = "myflightbook-v1";

/**
 * GET — OAuth callback. Verify the state against this browser, swap the one-time code for tokens (server to server),
 * store them encrypted, then run the first import. Always ends in a redirect to /wallet/logbook with a short status code
 * in the query string (never raw upstream text): the page turns those codes into messages.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(req);
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.redirect(`${origin}/auth/signin?next=/wallet/logbook`);

  // Single use: whatever happens next, this browser's nonce is spent.
  const done = (q: string) => {
    const res = NextResponse.redirect(`${origin}/wallet/logbook?${q}`);
    res.cookies.set(NONCE_COOKIE, "", { path: "/api/logbook/connect", maxAge: 0 });
    return res;
  };

  if (!isProvider(provider)) return done("connect=setup");
  let cfg;
  try {
    cfg = getMfbConfig();
  } catch (e) {
    console.error(`[connect.${provider}] misconfigured:`, e instanceof Error ? e.message : e);
    return done(`connect=setup&provider=${provider}`);
  }
  if (!cfg) return done(`connect=setup&provider=${provider}`);

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return done(`connect=denied&provider=${provider}`);
  const code = q.get("code");
  if (!code || !checkOAuthState(q.get("state"), req.cookies.get(NONCE_COOKIE)?.value, provider)) {
    return done(`connect=badstate&provider=${provider}`);
  }

  try {
    const tokens = await exchangeCode(cfg, code, redirectUri(origin, provider));
    await saveConnection(personId, tokens);
  } catch (e) {
    console.error(`[connect.${provider}] token exchange failed:`, e instanceof Error ? e.message : e);
    return done(`connect=tokenfail&provider=${provider}`);
  }

  // The pilot has just approved sharing on the provider's own consent screen; keep a versioned record (POPIA).
  try {
    const existing = await db.consent.findFirst({ where: { personId, scope: CONSENT_SCOPE, revokedAt: null }, select: { id: true } });
    if (!existing) await db.consent.create({ data: { personId, scope: CONSENT_SCOPE, textVersion: CONSENT_TEXT_VERSION } });
  } catch (e) {
    console.error(`[connect.${provider}] consent record failed:`, e instanceof Error ? e.message : e);
  }

  const result = await syncMyFlightbook(personId);
  if (!result.ok) {
    const status = result.error === "save_failed" ? "savefail" : result.error === "reauth_required" ? "tokenfail" : "fetchfail";
    return done(`connect=${status}&provider=${provider}`);
  }
  if (result.empty) return done(`connect=empty&provider=${provider}`);
  return done(`connected=${provider}&count=${result.total}&skipped=${result.skipped}`);
}
