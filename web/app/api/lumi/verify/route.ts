import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractFromDocument, isLumiConfigured, LUMI_ACCEPTED_MEDIA, type LumiDocKind } from "@/lib/lumi";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";
import { applyLumiExtraction } from "@/lib/verify-credential";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep under Vercel's serverless request-body ceiling and our own cost budget.
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST (multipart, field `file`) — the signed-in crew member uploads their licence document; Lumi reads
 * it and, if it's the right document, legible, and matches their account, marks their credential verified.
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isLumiConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Lumi isn't switched on yet. Add ANTHROPIC_API_KEY in Vercel." },
      { status: 503 },
    );
  }
  if (isRateLimited(`lumi:${personId}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many verification attempts. Please wait a few minutes." }, { status: 429 });
  }

  const person = await db.person.findUnique({
    where: { id: personId },
    select: {
      fullName: true,
      credentials: {
        where: { type: { in: ["PILOT_LICENCE", "CABIN_CREW_CERT"] } },
        select: { id: true, type: true, licenceNumber: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  const cred = person?.credentials[0];
  if (!person || !cred) return NextResponse.json({ error: "no_credential", message: "No licence on file to verify against." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Upload a file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file", message: "Upload a file." }, { status: 400 });

  const mediaType = file.type;
  if (!(LUMI_ACCEPTED_MEDIA as readonly string[]).includes(mediaType)) {
    return NextResponse.json({ error: "bad_type", message: "Upload a PDF or an image (JPG, PNG, WEBP)." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "File must be between 1 byte and 4 MB." }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const kind: LumiDocKind = cred.type === "CABIN_CREW_CERT" ? "cabin_crew_licence" : "pilot_licence";

  const result = await extractFromDocument({ data, mediaType }, kind, person.fullName);
  if (!result.ok || !result.extraction) {
    const msg =
      result.error === "parse_failed"
        ? "Lumi couldn't read that document. Try a clearer scan or the official SACAA PDF."
        : "Lumi is temporarily unavailable. Please try again shortly.";
    return NextResponse.json({ ok: false, error: result.error, message: msg }, { status: result.error === "parse_failed" ? 422 : 502 });
  }

  const applied = await applyLumiExtraction(cred.id, result.extraction, {
    expectedName: person.fullName,
    declaredLicence: cred.licenceNumber,
  });

  return NextResponse.json({
    ok: true,
    verified: applied.verified,
    reasons: applied.reasons,
    extracted: {
      documentType: result.extraction.documentType,
      licenceNumber: result.extraction.licenceNumber,
      holderName: result.extraction.holderName,
      licenceType: result.extraction.licenceType,
      status: result.extraction.status,
      expires: result.extraction.expires,
      ratings: result.extraction.ratings,
      confidence: result.extraction.confidence,
      issues: result.extraction.issues,
    },
  });
}
