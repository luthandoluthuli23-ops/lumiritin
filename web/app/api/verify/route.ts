import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pilotReputation } from "@/lib/insights";
import { fetchSacaaLicence } from "@/lib/sacaa";

export const dynamic = "force-dynamic";

const LICENCE_RE = /^[A-Za-z0-9-]{4,20}$/;

// Each call may make a live request to the SACAA portal, so keep anonymous traffic low.
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

const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * GET /api/verify?licence=0270999999 — public licence lookup across every source we have:
 * the live SACAA portal, and, when that is unavailable (or hosted without the verifier), the
 * pilot's last SACAA-verified record held on Lumiritin, plus their platform reputation.
 * Only licence status/category/expiry/ratings/medical and aggregate reputation are exposed —
 * never holder contact details.
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

  // Live SACAA check and our own records, in parallel.
  const [result, cred] = await Promise.all([
    fetchSacaaLicence(licence),
    db.credential.findFirst({
      where: { licenceNumber: licence },
      select: {
        personId: true,
        licenceNumber: true,
        licenceCategory: true,
        portalStatus: true,
        expiresAt: true,
        lastVerifiedAt: true,
        ratings: { select: { name: true, expiresAt: true }, orderBy: { name: "asc" } },
        person: { select: { medicals: { select: { class: true, expiresAt: true }, orderBy: { class: "asc" }, take: 1 } } },
      },
    }),
  ]);
  if (result.error) console.error(`[api/verify] ${result.outcome}: ${result.error}`);

  const record = result.record;
  let licenceOut:
    | { number: string; category: string | null; status: string | null; expires: string | null; ratings: { name: string; expires: string | null }[]; medical: { medical_class: number | null; expires: string | null } | null; source: "sacaa_live" | "lumiritin_records"; lastVerified: string | null }
    | null = null;

  if (result.outcome === "VERIFIED" && record) {
    licenceOut = {
      number: record.licence_number,
      category: record.licence_type,
      status: record.status,
      expires: record.expires,
      ratings: record.ratings,
      medical: record.medical,
      source: "sacaa_live",
      lastVerified: null,
    };
  } else if (cred) {
    const med = cred.person.medicals[0];
    licenceOut = {
      number: cred.licenceNumber,
      category: cred.licenceCategory,
      status: cred.portalStatus,
      expires: toIso(cred.expiresAt),
      ratings: cred.ratings.map((r) => ({ name: r.name, expires: toIso(r.expiresAt) })),
      medical: med ? { medical_class: med.class, expires: toIso(med.expiresAt) } : null,
      source: "lumiritin_records",
      lastVerified: cred.lastVerifiedAt ? cred.lastVerifiedAt.toISOString() : null,
    };
  }

  let platform: {
    onPlatform: true;
    score: number;
    tier: string;
    components: { reliability: number; compliance: number; experience: number };
    dutiesCompleted: number;
    totalHours: number;
    verifiedCredentials: number;
  } | null = null;
  if (cred) {
    const rep = await pilotReputation(cred.personId);
    platform = {
      onPlatform: true,
      score: rep.score,
      tier: rep.tier,
      components: rep.components,
      dutiesCompleted: rep.stats.dutiesCompleted,
      totalHours: rep.stats.totalHours,
      verifiedCredentials: rep.stats.credentialsVerified,
    };
  }

  return NextResponse.json({
    outcome: result.outcome,
    error: result.outcome === "VERIFIED" || result.outcome === "NOT_FOUND" ? null : "portal_unavailable",
    licence: licenceOut,
    platform,
  });
}
