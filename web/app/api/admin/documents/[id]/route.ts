import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { decryptDocument } from "@/lib/documents";
import { getReviewer } from "@/lib/reviewers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — an uploaded licence/medical document, decrypted for a REVIEWER only. Never cached, never sniffed, and shown in
 * a sandbox so a malicious PDF/SVG can't run script on our origin. Anyone else gets a plain 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer();
  if (!reviewer) return new NextResponse("Not found", { status: 404 });

  const doc = await db.verificationDocument.findUnique({ where: { id: (await params).id } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  let plain: Buffer;
  try {
    plain = decryptDocument(doc.ciphertext, doc.submissionId, doc.kind);
  } catch (e) {
    console.error("[admin.documents] decrypt failed:", e instanceof Error ? e.message : e);
    return new NextResponse("This document can't be opened.", { status: 500 });
  }
  console.info(`[admin.documents] ${reviewer} opened document ${doc.id} (${doc.kind}) of submission ${doc.submissionId}`);
  const isPdf = doc.mediaType === "application/pdf";
  return new NextResponse(new Uint8Array(plain), {
    headers: {
      "Content-Type": doc.mediaType,
      // Images show inline; PDFs download (a PDF viewer on our origin is more attack surface than a reviewer needs).
      "Content-Disposition": isPdf ? `attachment; filename="${doc.kind.toLowerCase()}-${doc.submissionId}.pdf"` : "inline",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}
