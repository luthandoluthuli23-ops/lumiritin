// Native (Node) SACAA personnel-licence lookup, so verification runs on Vercel without the Python
// verifier. It calls SACAA's public card-licence endpoint (the URL a licence card's QR code points
// to) and parses the returned page. Parsing is label-alias based and tolerant: the exact field
// labels are not documented, so unmapped labels are kept and the mapping can be refined from a real
// response without touching the fetch logic. Does not store anything (matches /api/verify's contract).
import { parse, type HTMLElement } from "node-html-parser";

export interface SacaaRating {
  name: string;
  expires: string | null;
}

export interface SacaaRecord {
  licence_number: string;
  holder_name: string | null;
  licence_type: string | null;
  status: string | null;
  issued: string | null;
  expires: string | null;
  ratings: SacaaRating[];
  medical: { medical_class: number | null; expires: string | null } | null;
  unmapped: Record<string, string>;
}

export type SacaaOutcome = "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR";
export interface SacaaResult {
  outcome: SacaaOutcome;
  record: SacaaRecord | null;
  error: string | null;
}

const BASE_URL = process.env.SACAA_LICENCE_URL ?? "https://personellicensing.caa.co.za/CAALicense/caaLicense";
// Kept under the serverless function budget; on timeout we fall back to stored records.
const TIMEOUT_MS = Number(process.env.SACAA_TIMEOUT_MS ?? 6000);

const FIELD_ALIASES: Record<string, string[]> = {
  licence_number: ["licence number", "license number", "licence no", "licence no.", "number"],
  holder_name: ["name", "full name", "holder", "licence holder", "surname and initials"],
  licence_type: ["licence type", "license type", "licence category", "category", "type of licence"],
  status: ["status", "licence status", "license status"],
  issued: ["date issued", "issue date", "issued", "date of issue"],
  expires: ["expiry date", "expiry", "valid until", "expires", "licence expiry", "date of expiry"],
  medical_class: ["medical class", "medical certificate class", "class of medical"],
  medical_expires: ["medical expiry", "medical expiry date", "medical valid until", "medical certificate expiry"],
};

const RATING_NAME_HEADERS = ["rating", "rating name", "type rating", "endorsement"];
const RATING_EXPIRY_HEADERS = ["expiry", "expiry date", "valid until", "expires"];

const NOT_FOUND_RE = /(no\s+(records?|results?|licen[cs]e)\s+(were|was)?\s*found|invalid\s+licen[cs]e|not\s+found)/i;
const BLOCK_RE = /(captcha|g-recaptcha|hcaptcha|are you a robot|access denied)/i;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().replace(/:$/, "").trim().toLowerCase();

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse common SA date shapes to ISO yyyy-mm-dd, or null. */
function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || ["-", "n/a", "na", "none", "non-expiring"].includes(v.toLowerCase())) return null;
  let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); // 2026-12-31
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // 31/12/2026
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/); // 31 December 2026
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function headerCells(table: HTMLElement): string[] {
  const head = table.querySelector("tr");
  if (!head) return [];
  return head.querySelectorAll("th").map((c) => norm(c.text));
}

function isRatingTable(table: HTMLElement): boolean {
  const headers = headerCells(table);
  return headers.length >= 2 && headers.some((h) => RATING_NAME_HEADERS.includes(h));
}

function collectPairs(root: HTMLElement): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const table of root.querySelectorAll("table")) {
    if (isRatingTable(table)) continue;
    for (const row of table.querySelectorAll("tr")) {
      const cells = row.querySelectorAll("th, td").filter((c) => c.parentNode === row);
      if (cells.length === 2) {
        const label = norm(cells[0].text);
        const value = cells[1].text.replace(/\s+/g, " ").trim();
        if (label && !(label in pairs)) pairs[label] = value;
      }
    }
  }
  for (const dl of root.querySelectorAll("dl")) {
    const dts = dl.querySelectorAll("dt");
    for (const dt of dts) {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        const label = norm(dt.text);
        if (label && !(label in pairs)) pairs[label] = dd.text.replace(/\s+/g, " ").trim();
      }
    }
  }
  return pairs;
}

function parseRatings(root: HTMLElement): SacaaRating[] {
  const out: SacaaRating[] = [];
  for (const table of root.querySelectorAll("table")) {
    if (!isRatingTable(table)) continue;
    const headers = headerCells(table);
    const nameIdx = headers.findIndex((h) => RATING_NAME_HEADERS.includes(h));
    const expIdx = headers.findIndex((h) => RATING_EXPIRY_HEADERS.includes(h));
    for (const row of table.querySelectorAll("tr").slice(1)) {
      const cells = row.querySelectorAll("td, th").map((c) => c.text.replace(/\s+/g, " ").trim());
      if (nameIdx < 0 || nameIdx >= cells.length || !cells[nameIdx]) continue;
      out.push({ name: cells[nameIdx], expires: expIdx >= 0 && expIdx < cells.length ? parseDate(cells[expIdx]) : null });
    }
  }
  return out;
}

function mapField(pairs: Record<string, string>, field: string, used: Set<string>): string | null {
  for (const alias of FIELD_ALIASES[field] ?? []) {
    if (alias in pairs) {
      used.add(alias);
      return pairs[alias];
    }
  }
  return null;
}

export function parseLicencePage(html: string, requested: string): SacaaRecord | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (NOT_FOUND_RE.test(text)) return null;

  const root = parse(html);
  const pairs = collectPairs(root);
  const used = new Set<string>();

  const medClassRaw = mapField(pairs, "medical_class", used);
  const medExpires = mapField(pairs, "medical_expires", used);
  const medDigit = medClassRaw?.match(/\d/);

  const record: SacaaRecord = {
    licence_number: (mapField(pairs, "licence_number", used) || requested).trim(),
    holder_name: mapField(pairs, "holder_name", used),
    licence_type: mapField(pairs, "licence_type", used),
    status: mapField(pairs, "status", used),
    issued: parseDate(mapField(pairs, "issued", used)),
    expires: parseDate(mapField(pairs, "expires", used)),
    ratings: parseRatings(root),
    medical: medClassRaw || medExpires ? { medical_class: medDigit ? Number(medDigit[0]) : null, expires: parseDate(medExpires) } : null,
    unmapped: Object.fromEntries(Object.entries(pairs).filter(([k]) => !used.has(k))),
  };

  // If we extracted essentially nothing, treat as not found rather than a blank "verified".
  const gotSomething = record.holder_name || record.licence_type || record.status || record.expires || record.ratings.length > 0;
  return gotSomething ? record : null;
}

/** Strip the leading "027" the portal does not want in the lno parameter. */
function toLno(licence: string): string {
  const v = licence.trim();
  return v.startsWith("027") && v.length > 3 ? v.slice(3) : v;
}

export async function fetchSacaaLicence(licence: string): Promise<SacaaResult> {
  const url = `${BASE_URL}?lno=${encodeURIComponent(toLno(licence))}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Lumiritin/1.0 (licence verification)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return { outcome: "PORTAL_ERROR", record: null, error: err instanceof Error ? err.message : String(err) };
  }

  if (res.status === 404) return { outcome: "NOT_FOUND", record: null, error: null };
  if (res.status === 403 || res.status === 429) return { outcome: "BLOCKED", record: null, error: `HTTP ${res.status}` };
  if (!res.ok) return { outcome: "PORTAL_ERROR", record: null, error: `HTTP ${res.status}` };

  const html = await res.text();
  if (BLOCK_RE.test(html)) return { outcome: "BLOCKED", record: null, error: "bot check" };

  const record = parseLicencePage(html, licence);
  return record ? { outcome: "VERIFIED", record, error: null } : { outcome: "NOT_FOUND", record: null, error: null };
}
