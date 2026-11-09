import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { disconnectMyFlightbook } from "@/lib/logbook-sync";
import { NONCE_COOKIE, STATE_TTL_MS, appOrigin, isProvider, newOAuthState, redirectUri } from "@/lib/logbook-connect";
import { buildAuthorizeUrl } from "@/lib/myflightbook/client";
import { getMfbConfig } from "@/lib/myflightbook/config";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: NextRequest, q: string) => NextResponse.redirect(`${appOrigin(req)}/wallet/logbook?${q}`);

/** GET — start the OAuth flow: send the signed-in pilot to the provider to approve read access to their flights. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.redirect(`${appOrigin(req)}/auth/signin?next=/wallet/logbook`);
  if (!isProvider(provider)) return back(req, "connect=setup");

  let cfg;
  try {
    cfg = getMfbConfig();
  } catch (e) {
    console.error(`[connect.${provider}] misconfigured:`, e instanceof Error ? e.message : e);
    return back(req, `connect=setup&provider=${provider}`);
  }
  if (!cfg) return back(req, `connect=setup&provider=${provider}`);

  const origin = appOrigin(req);
  const { state, nonce } = newOAuthState(provider);
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, redirectUri(origin, provider), state));
  // Binds this browser to the state we just issued; the callback requires both to match, then deletes the cookie.
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from the provider
    secure: origin.startsWith("https://"),
    path: "/api/logbook/connect",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}

const disconnectSchema = z.object({ removeFlights: z.boolean().optional() });

/** DELETE — forget the connection (stored tokens). With { removeFlights: true } also delete the flights imported from the provider. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isProvider(provider)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = disconnectSchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  const { removedFlights } = await disconnectMyFlightbook(personId, parsed.data.removeFlights ?? false);
  return NextResponse.json({ ok: true, removedFlights });
}
