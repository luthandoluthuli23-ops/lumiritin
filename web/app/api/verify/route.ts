import { NextResponse, type NextRequest } from "next/server";
import { runVerifier } from "@/lib/verifier";

export const dynamic = "force-dynamic";

const LICENCE_RE = /^[A-Za-z0-9-]{4,20}$/;

// Each call makes a live request to the SACAA portal, so keep anonymous traffic low.
// In-memory and per-process: fine for one server, replace with a shared store when scaled out.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

/**
 * GET /api/verify?licence=0270999999 — one-off public lookup against the SACAA portal.
 * Returns only licence status, category, expiry and ratings; holder name and unmapped fields are not exposed.
 * This does not store anything or require consent; stored/nightly verification stays consent-gated (see jobs/).
 */
export async function GET(req: NextRequest) {
  const licence = req.nextUrl.searchParams.get("licence")?.trim() ?? "";
  if (!LICENCE_RE.test(licence)) {
    return NextResponse.json({ error: "invalid_licence_number" }, { status: 422 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const result = await runVerifier(licence);
  const { record } = result;
  if (result.error) console.error(`[api/verify] ${result.outcome}: ${result.error}`);

  return NextResponse.json({
    outcome: result.outcome,
    // Internal verifier errors (paths, stderr) stay in the server log.
    error: result.outcome === "VERIFIED" || result.outcome === "NOT_FOUND" ? null : "portal_unavailable",
    licence: record && {
      number: record.licence_number,
      category: record.licence_type,
      status: record.status,
      expires: record.expires,
      ratings: record.ratings,
      medical: record.medical,
    },
  });
}
