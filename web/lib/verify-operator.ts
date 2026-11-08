import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { LumiExtraction } from "@/lib/lumi";

const toDate = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function aocDigitsMatch(a: string | null, b: string | null): boolean {
  const x = digitsOnly(a);
  const y = digitsOnly(b);
  if (!x || !y) return true;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** Loose match: at least one shared real word (>=3 letters) between the certificate name and the operator name. */
function nameMatches(docName: string | null, operatorName: string | null): boolean {
  const toks = (s: string | null) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !["pty", "ltd", "cc", "inc", "the", "and"].includes(t));
  const doc = new Set(toks(docName));
  const op = toks(operatorName);
  if (doc.size === 0 || op.length === 0) return false;
  return op.filter((t) => doc.has(t)).some((t) => t.length >= 3);
}

export interface LumiAocResult {
  verified: boolean;
  reasons: string[];
  extraction: LumiExtraction;
}

const CONFIDENCE_FLOOR = 0.7;

/**
 * Apply a Lumi AOC-document extraction to an operator. Auto-verifies only when the document is an AOC,
 * high-confidence, the AOC number matches what's on file (if any), and the certificate's operator name
 * matches the account. Otherwise it changes nothing and returns the reasons.
 */
export async function applyLumiAocExtraction(
  operatorId: string,
  extraction: LumiExtraction,
  opts: { operatorName?: string | null; declaredAoc?: string | null } = {},
): Promise<LumiAocResult> {
  const reasons: string[] = [];
  if (!extraction.isExpectedDocument) reasons.push("This doesn't look like an Air Operator Certificate.");
  if (!extraction.aocNumber) reasons.push("No AOC number could be read from the document.");
  if (extraction.confidence < CONFIDENCE_FLOOR) reasons.push("The scan wasn't clear enough to verify confidently — try a sharper copy of the certificate.");
  if (opts.operatorName && !nameMatches(extraction.holderName, opts.operatorName)) {
    reasons.push("The operator name on the certificate doesn't match your account.");
  }
  if (opts.declaredAoc && extraction.aocNumber && !aocDigitsMatch(extraction.aocNumber, opts.declaredAoc)) {
    reasons.push("The AOC number on the certificate doesn't match the one on your profile.");
  }

  if (reasons.length > 0) return { verified: false, reasons, extraction };

  await db.operator.update({
    where: { id: operatorId },
    data: {
      aocStatus: extraction.status ?? "Valid",
      aocVerifiedAt: new Date(),
      aocSnapshot: { source: "lumi_document", verifiedExpires: toDate(extraction.expires)?.toISOString() ?? null, ...extraction } as unknown as Prisma.InputJsonValue,
      // Fill the AOC number from the certificate if the operator hadn't recorded one.
      ...(opts.declaredAoc ? {} : extraction.aocNumber ? { aocNumber: extraction.aocNumber } : {}),
    },
  });

  return { verified: true, reasons: [], extraction };
}
