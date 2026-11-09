import { NextResponse, type NextRequest } from "next/server";
import { extractFromDocument, isLumiConfigured, LUMI_ACCEPTED_MEDIA, type LumiDocKind } from "@/lib/lumi";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const KINDS: LumiDocKind[] = ["pilot_licence", "cabin_crew_licence", "logbook", "aoc"];

/**
 * POST (multipart: `file`, optional `kind`) — PUBLIC, no account needed. Lets a prospective crew member or
 * operator try Lumi on a document and see what it reads. It never touches the database, never verifies an
 * account, and nothing is stored. Because it is unauthenticated and spends API credits, it is tightly
 * rate-limited per IP and globally.
 */
export async function POST(req: NextRequest) {
  if (!isLumiConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "Lumi isn't switched on yet. Check back soon." }, { status: 503 });
  }

  const ip = clientIp(req);
  // Per-visitor cap, plus a global ceiling so the demo can never run up a surprise API bill.
  if (isRateLimited(`lumi-try:ip:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "You've reached the demo limit (5 per hour). Create an account to verify for real." }, { status: 429 });
  }
  if (isRateLimited("lumi-try:global", 80, 60 * 60_000)) {
    return NextResponse.json({ error: "busy", message: "The demo is very busy right now — please try again in a little while." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Upload a file." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file", message: "Upload a file." }, { status: 400 });

  const kindRaw = String(form.get("kind") ?? "pilot_licence");
  const kind: LumiDocKind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as LumiDocKind) : "pilot_licence";

  const mediaType = file.type;
  if (!(LUMI_ACCEPTED_MEDIA as readonly string[]).includes(mediaType)) {
    return NextResponse.json({ error: "bad_type", message: "Upload a PDF or an image (JPG, PNG, WEBP)." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "File must be between 1 byte and 4 MB." }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await extractFromDocument({ data, mediaType }, kind);
  if (!result.ok || !result.extraction) {
    const msg =
      result.error === "parse_failed"
        ? "Lumi couldn't read that document. Try a clearer scan or the official SACAA PDF."
        : "Lumi is temporarily unavailable. Please try again shortly.";
    return NextResponse.json({ ok: false, error: result.error, message: msg }, { status: result.error === "parse_failed" ? 422 : 502 });
  }

  const e = result.extraction;
  return NextResponse.json({
    ok: true,
    expectedKind: kind,
    extracted: {
      documentType: e.documentType,
      isExpectedDocument: e.isExpectedDocument,
      licenceNumber: e.licenceNumber,
      holderName: e.holderName,
      licenceType: e.licenceType,
      status: e.status,
      issued: e.issued,
      expires: e.expires,
      ratings: e.ratings,
      medical: e.medical,
      aocNumber: e.aocNumber,
      approvedTypes: e.approvedTypes,
      totalHours: e.totalHours,
      confidence: e.confidence,
      issues: e.issues,
    },
  });
}
