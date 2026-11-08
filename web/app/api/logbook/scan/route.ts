import { NextResponse, type NextRequest } from "next/server";
import { extractFlightsFromDocument, isLumiConfigured, LUMI_ACCEPTED_MEDIA } from "@/lib/lumi";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * POST (multipart: `file`) — scan a logbook page/photo/PDF and READ its flights back as draft rows for the
 * pilot to review and edit before saving. Unlike /import this writes nothing; the reviewed rows are saved
 * through POST /api/logbook/entries (batch). This is the "scan in order to fill in" flow.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Upload a photo or PDF of your logbook page." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file", message: "Upload a photo or PDF of your logbook page." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "too_large", message: "File must be between 1 byte and 6 MB." }, { status: 413 });
  if (!(LUMI_ACCEPTED_MEDIA as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "bad_type", message: "Upload a PDF or an image (JPEG, PNG, WebP) of your logbook page." }, { status: 415 });
  }
  if (!isLumiConfigured()) return NextResponse.json({ error: "not_configured", message: "Scanning isn't switched on yet. Add a flight by hand instead." }, { status: 503 });
  if (isRateLimited(`lumi:scan:${personId}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many scans. Please wait a few minutes." }, { status: 429 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await extractFlightsFromDocument({ data, mediaType: file.type });
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "Couldn't read that page. Try a sharper, well-lit photo, or add the flight by hand." }, { status: 422 });
  }
  const flights = (result.flights ?? []).map((r) => ({
    date: r.date ?? "",
    departureIcao: r.from ?? "",
    arrivalIcao: r.to ?? "",
    aircraftType: r.aircraftType ?? "",
    aircraftReg: r.aircraftReg ?? "",
    totalHours: r.total != null ? round1(r.total) : null,
    picHours: r.pic,
    coPilotHours: r.coPilot,
    dualHours: r.dual,
    instructorHours: r.instructor,
    nightHours: r.night,
    instrumentHours: r.instrument,
    multiEngineHours: r.multi,
    turbineHours: r.turbine,
    dayLandings: r.dayLandings ?? 0,
    nightLandings: r.nightLandings ?? 0,
    certifier: r.certifier ?? "",
    remarks: r.remarks ?? "",
  }));

  if (flights.length === 0) {
    return NextResponse.json({ ok: false, message: "No flights were readable on that page. Try a clearer photo, or add the flight by hand." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, flights });
}
