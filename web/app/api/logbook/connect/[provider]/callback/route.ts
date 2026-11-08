import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { exchangeCode, fetchMyFlightbookFlights, getProvider, redirectUri, verifyState } from "@/lib/logbook-connect";
import { lumiRowsToEntries, replaceImported } from "@/lib/logbook";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const origin = (req: NextRequest) => process.env.APP_BASE_URL ?? req.nextUrl.origin;
const back = (req: NextRequest, q: string) => NextResponse.redirect(`${origin(req)}/wallet/logbook?${q}`);

/** GET — OAuth callback: exchange the code, pull the pilot's flights, and import them. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.redirect(`${origin(req)}/auth/signin?next=/wallet/logbook`);

  const cfg = getProvider(provider);
  if (!cfg) return back(req, `connect=setup&provider=${encodeURIComponent(provider)}`);

  const url = req.nextUrl;
  const err = url.searchParams.get("error");
  if (err) return back(req, `connect=denied&provider=${provider}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code || !verifyState(state, personId, provider)) return back(req, `connect=badstate&provider=${provider}`);

  const token = await exchangeCode(cfg, code, redirectUri(origin(req), provider));
  if (!token) return back(req, `connect=tokenfail&provider=${provider}`);

  const result = provider === "myflightbook" ? await fetchMyFlightbookFlights(cfg, token) : { ok: false, flights: [], error: "unsupported" };
  if (!result.ok) {
    console.error(`[connect.${provider}] fetch failed: ${result.error}`);
    return back(req, `connect=fetchfail&provider=${provider}`);
  }

  const rows = lumiRowsToEntries(result.flights, personId);
  const { imported } = await replaceImported(personId, rows);
  await db.person.update({ where: { id: personId }, data: { logbookProvider: cfg.name } });
  return back(req, `connected=${provider}&count=${imported}`);
}
