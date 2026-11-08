import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { extractFromDocument, isLumiConfigured, LUMI_ACCEPTED_MEDIA } from "@/lib/lumi";
import { isRateLimited } from "@/lib/rate-limit";
import { getOperatorContext } from "@/lib/session";
import { applyLumiAocExtraction } from "@/lib/verify-operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

/** POST (multipart, field `file`) — operator uploads their AOC certificate; Lumi reads and verifies it. */
export async function POST(req: NextRequest) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (operator.isPrivate) {
    return NextResponse.json({ error: "not_applicable", message: "Private operators don't hold an AOC, so there's nothing to verify here." }, { status: 400 });
  }

  if (!isLumiConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "Lumi isn't switched on yet. Add ANTHROPIC_API_KEY in Vercel." }, { status: 503 });
  }
  if (isRateLimited(`lumi-aoc:${operator.operatorId}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many verification attempts. Please wait a few minutes." }, { status: 429 });
  }

  const row = await db.operator.findUnique({ where: { id: operator.operatorId }, select: { name: true, aocNumber: true } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Upload a file." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file", message: "Upload a file." }, { status: 400 });
  if (!(LUMI_ACCEPTED_MEDIA as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "bad_type", message: "Upload a PDF or an image (JPG, PNG, WEBP)." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "File must be between 1 byte and 4 MB." }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await extractFromDocument({ data, mediaType: file.type }, "aoc", row.name);
  if (!result.ok || !result.extraction) {
    const msg =
      result.error === "parse_failed"
        ? "Lumi couldn't read that document. Try a clearer scan of the certificate."
        : "Lumi is temporarily unavailable. Please try again shortly.";
    return NextResponse.json({ ok: false, error: result.error, message: msg }, { status: result.error === "parse_failed" ? 422 : 502 });
  }

  const applied = await applyLumiAocExtraction(operator.operatorId, result.extraction, {
    operatorName: row.name,
    declaredAoc: row.aocNumber,
  });

  const e = result.extraction;
  return NextResponse.json({
    ok: true,
    verified: applied.verified,
    reasons: applied.reasons,
    // Same shape the crew panel renders.
    extracted: {
      documentType: e.documentType,
      licenceNumber: e.aocNumber,
      holderName: e.holderName,
      licenceType: e.licenceType ?? "Air Operator Certificate",
      status: e.status,
      expires: e.expires,
      ratings: e.approvedTypes.map((name) => ({ name, expires: null })),
      confidence: e.confidence,
      issues: e.issues,
    },
  });
}
