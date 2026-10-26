// Lumi — Lumiritin's AI verification concierge. Reads a credential document (a SACAA licence PDF the
// holder downloaded via the card-scan/OTP flow, a photo of the licence card, a logbook export, or an
// operator's AOC certificate) and extracts the structured facts we verify against. SACAA's portal now
// gates licence data behind an OTP sent to the holder, so it can't be scraped server-side; Lumi works on
// the holder's own authenticated document instead. Gated on ANTHROPIC_API_KEY (dry-run without it),
// mirroring how email/WhatsApp are gated — never throws into the request path.
import "server-only";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.LUMI_MODEL ?? "claude-opus-5-5";

export const isLumiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export type LumiDocKind = "pilot_licence" | "cabin_crew_licence" | "logbook" | "aoc";

export const LUMI_ACCEPTED_MEDIA = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export interface LumiExtraction {
  /** What Lumi judged the document to be, in its own words. */
  documentType: string | null;
  /** True if the document matches the kind the user said they were uploading. */
  isExpectedDocument: boolean;
  licenceNumber: string | null;
  holderName: string | null;
  licenceType: string | null;
  status: string | null;
  issued: string | null; // yyyy-mm-dd
  expires: string | null; // yyyy-mm-dd
  ratings: { name: string; expires: string | null }[];
  medical: { class: number | null; expires: string | null } | null;
  aocNumber: string | null; // operators
  approvedTypes: string[]; // operators: approved aircraft types
  totalHours: number | null; // logbooks
  /** Lumi's own confidence that the extracted facts are correct and the document is genuine (0–1). */
  confidence: number;
  /** Anomalies worth a human's attention: signs of tampering, mismatches, illegibility. */
  issues: string[];
}

export interface LumiResult {
  ok: boolean;
  extraction?: LumiExtraction;
  error?: string;
}

const KIND_LABEL: Record<LumiDocKind, string> = {
  pilot_licence: "a SACAA pilot licence (flight crew licence card or the downloaded PDF)",
  cabin_crew_licence: "a SACAA cabin crew member licence",
  logbook: "a pilot logbook (digital export or scan)",
  aoc: "a SACAA Air Operator Certificate (AOC) or its operations specifications",
};

const SYSTEM = `You are Lumi, the verification concierge for Lumiritin, an aviation crewing platform in South Africa.
You read an uploaded credential document and extract the facts the platform verifies, and you flag anything that looks wrong or tampered with.

Rules:
- Work ONLY from what is visibly present in the document. Never invent, infer, or complete a value you cannot read. If a field is absent or unreadable, use null.
- Dates must be ISO yyyy-mm-dd. Convert any date you read (e.g. "31 Dec 2027", "2027/03/14") to that format. If a date is ambiguous or unreadable, use null.
- Judge whether the document is genuinely the kind requested. If it is the wrong kind of document, set isExpectedDocument to false and explain in issues.
- Be conservative with confidence. Lower it for: blurry/partial scans, missing key fields, inconsistent fonts or alignment, signs of editing, or watermarks indicating a sample/specimen.
- List concrete concerns in issues (e.g. "expiry date overlaps a different font", "name not legible", "appears to be a training certificate, not a licence").
- Respond with ONLY a single JSON object and nothing else — no prose, no markdown fences.

JSON shape:
{
  "documentType": string|null,
  "isExpectedDocument": boolean,
  "licenceNumber": string|null,
  "holderName": string|null,
  "licenceType": string|null,
  "status": string|null,
  "issued": string|null,
  "expires": string|null,
  "ratings": [{"name": string, "expires": string|null}],
  "medical": {"class": number|null, "expires": string|null}|null,
  "aocNumber": string|null,
  "approvedTypes": [string],
  "totalHours": number|null,
  "confidence": number,
  "issues": [string]
}`;

function parseJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  // Strip ```json fences if the model added them despite instructions.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Fall back to the outermost braces.
  if (!t.startsWith("{")) {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
  }
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function normalize(raw: Record<string, unknown>): LumiExtraction {
  const ratings = Array.isArray(raw.ratings)
    ? raw.ratings
        .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
        .map((r) => ({ name: str(r.name) ?? "", expires: str(r.expires) }))
        .filter((r) => r.name)
    : [];
  const med = raw.medical && typeof raw.medical === "object" ? (raw.medical as Record<string, unknown>) : null;
  const rawConf = num(raw.confidence);
  return {
    documentType: str(raw.documentType),
    isExpectedDocument: raw.isExpectedDocument !== false, // default true unless explicitly false
    licenceNumber: str(raw.licenceNumber),
    holderName: str(raw.holderName),
    licenceType: str(raw.licenceType),
    status: str(raw.status),
    issued: str(raw.issued),
    expires: str(raw.expires),
    ratings,
    medical: med ? { class: num(med.class), expires: str(med.expires) } : null,
    aocNumber: str(raw.aocNumber),
    approvedTypes: Array.isArray(raw.approvedTypes) ? raw.approvedTypes.map(str).filter((s): s is string => !!s) : [],
    totalHours: num(raw.totalHours),
    confidence: rawConf == null ? 0 : Math.max(0, Math.min(1, rawConf)),
    issues: Array.isArray(raw.issues) ? raw.issues.map(str).filter((s): s is string => !!s) : [],
  };
}

/** Send one document to Lumi and get back the extracted, validated facts. Never throws. */
export async function extractFromDocument(
  file: { data: string; mediaType: string },
  kind: LumiDocKind,
  expectedName?: string,
): Promise<LumiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };

  const sourceBlock =
    file.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
      : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data } };

  const userText =
    `This upload is meant to be ${KIND_LABEL[kind]}.` +
    (expectedName ? ` The account holder's name on file is "${expectedName}" — note in issues if the document's name clearly doesn't match.` : "") +
    ` Extract the fields as the JSON object described.`;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        system: SYSTEM,
        messages: [{ role: "user", content: [sourceBlock, { type: "text", text: userText }] }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[lumi] HTTP ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    const parsed = parseJson(text);
    if (!parsed) {
      console.error(`[lumi] could not parse model output: ${text.slice(0, 300)}`);
      return { ok: false, error: "parse_failed" };
    }
    return { ok: true, extraction: normalize(parsed) };
  } catch (err) {
    console.error("[lumi] failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
