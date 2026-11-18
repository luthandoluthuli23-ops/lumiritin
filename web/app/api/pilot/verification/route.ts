import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { DOCUMENT_MEDIA, isDocumentStorageConfigured, MAX_DOCUMENT_BYTES, sniffDocumentType } from "@/lib/documents";
import { extractFromDocument, isLumiConfigured } from "@/lib/lumi";
import { createSubmission, submissionSchema, type UploadedDocument } from "@/lib/pilot-verification";
import { isRateLimited } from "@/lib/rate-limit";
import { getPilotPersonId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

async function readDoc(form: FormData, field: string, kind: UploadedDocument["kind"]): Promise<UploadedDocument | string> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return `Add a photo of your ${kind === "LICENCE" ? "licence" : "medical certificate"}.`;
  if (file.size > MAX_DOCUMENT_BYTES) return "Each file must be 2 MB or smaller. Photos are shrunk automatically; for a PDF, export a smaller one.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffDocumentType(bytes);
  if (!sniffed || !(DOCUMENT_MEDIA as readonly string[]).includes(sniffed)) return "Upload a JPG, PNG, WEBP photo or a PDF.";
  return { kind, mediaType: sniffed, bytes };
}

/**
 * POST (multipart) — the signed-in pilot asks to be verified: consent + licence details + licence and medical photos.
 * Goes into the reviewer queue; nothing is verified here. Lumi may read the licence photo afterwards to pre-fill the
 * reviewer's view (a hint only, never a decision).
 */
export async function POST(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return fail(403, "forbidden", "Sign in as a pilot first.");
  if (!isDocumentStorageConfigured()) return fail(503, "not_configured", "Document uploads aren't switched on yet. Please try again later.");
  if (isRateLimited(`verify-submit:${personId}`, 5, 60 * 60_000)) return fail(429, "rate_limited", "Too many attempts. Please wait an hour and try again.");

  const pending = await db.verificationSubmission.count({ where: { personId, status: "PENDING" } });
  if (pending > 0) return fail(409, "already_pending", "You already have documents waiting for review.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "The upload didn't come through. Please try again.");
  }
  if (form.get("consent") !== "on") return fail(422, "consent_required", "Please tick the consent box to continue.");

  const parsed = submissionSchema.safeParse({
    holderName: form.get("holderName"),
    licenceNumber: form.get("licenceNumber"),
    licenceType: form.get("licenceType") ?? "",
    licenceExpiresAt: form.get("licenceExpiresAt") ?? "",
    medicalClass: form.get("medicalClass") ?? "",
    medicalExpiresAt: form.get("medicalExpiresAt") ?? "",
    ratings: String(form.get("ratings") ?? "")
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }

  const licence = await readDoc(form, "licenceFile", "LICENCE");
  if (typeof licence === "string") return fail(422, "bad_licence_file", licence);
  const medical = await readDoc(form, "medicalFile", "MEDICAL");
  if (typeof medical === "string") return fail(422, "bad_medical_file", medical);

  const submissionId = await createSubmission(personId, parsed.data, [licence, medical]);

  // Lumi reads the licence photo for the reviewer's convenience, after the response (it can take a while).
  if (isLumiConfigured()) {
    after(async () => {
      const r = await extractFromDocument({ data: Buffer.from(licence.bytes).toString("base64"), mediaType: licence.mediaType }, "pilot_licence", parsed.data.holderName);
      if (r.ok && r.extraction) {
        await db.verificationSubmission.update({ where: { id: submissionId }, data: { lumiPrefill: JSON.parse(JSON.stringify(r.extraction)) } }).catch(() => undefined);
      }
    });
  }
  return NextResponse.json({ ok: true, submissionId }, { status: 201 });
}
