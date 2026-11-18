import { NextResponse, type NextRequest } from "next/server";
import { completeLookup, isOtpRelayEnabled, OtpRelayUnavailableError, startLookup } from "@/lib/sacaa-otp-relay";
import { getPilotPersonId } from "@/lib/session";

export const dynamic = "force-dynamic";

// SACAA OTP relay. Behind SACAA_OTP_RELAY (default false): while off this route doesn't exist (404).
// MUST NOT be enabled until a legal review of SACAA's terms of use is done (see lib/sacaa-otp-relay.ts).
export async function POST(req: NextRequest) {
  if (!isOtpRelayEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await getPilotPersonId())) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { step?: string; licenceNumber?: string; sessionId?: string; otp?: string } | null;
  try {
    if (body?.step === "start") return NextResponse.json(await startLookup(String(body.licenceNumber ?? "")));
    if (body?.step === "complete") return NextResponse.json(await completeLookup(String(body.sessionId ?? ""), String(body.otp ?? "")));
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    if (e instanceof OtpRelayUnavailableError) return NextResponse.json({ error: "not_available", message: e.message }, { status: 501 });
    throw e;
  }
}
