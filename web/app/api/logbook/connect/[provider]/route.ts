import { NextResponse, type NextRequest } from "next/server";
import { getProvider, redirectUri, signState } from "@/lib/logbook-connect";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const origin = (req: NextRequest) => process.env.APP_BASE_URL ?? req.nextUrl.origin;
const back = (req: NextRequest, q: string) => NextResponse.redirect(`${origin(req)}/wallet/logbook?${q}`);

/** GET — start the OAuth flow: send the signed-in pilot to the provider to authorize read access. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.redirect(`${origin(req)}/auth/signin?next=/wallet/logbook`);

  const cfg = getProvider(provider);
  if (!cfg) return back(req, `connect=setup&provider=${encodeURIComponent(provider)}`);

  const url = new URL(cfg.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri(origin(req), provider));
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", signState(personId, provider));
  return NextResponse.redirect(url.toString());
}
