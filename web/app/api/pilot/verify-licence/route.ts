import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";
import { verifyCredential } from "@/lib/verify-credential";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — run a live SACAA check for the signed-in pilot's licence and persist the result. */
export async function POST() {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (isRateLimited(`verify-licence:${personId}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many checks. Please wait a few minutes." }, { status: 429 });
  }

  // SACAA personnel licensing covers pilot licences; cabin-crew certs aren't in that portal.
  const cred = await db.credential.findFirst({
    where: { personId, type: "PILOT_LICENCE" },
    select: { id: true },
  });
  if (!cred) return NextResponse.json({ error: "no_licence", message: "No pilot licence on file to verify." }, { status: 404 });

  const result = await verifyCredential(cred.id);
  return NextResponse.json(result);
}
