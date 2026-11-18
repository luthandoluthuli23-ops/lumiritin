// Encryption at rest for uploaded identity documents (licence and medical photos).
//
// AES-256-GCM with a dedicated key, DOCUMENT_ENCRYPTION_KEY (32 random bytes, base64 or hex). There is NO fallback:
// without the key, uploads are refused rather than stored in the clear. Each ciphertext is bound to its submission and
// document kind (GCM additional data), so a blob can't be swapped onto another pilot's submission.
//
// Layout: [1 byte version = 1][12 byte IV][16 byte auth tag][ciphertext]
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export class DocumentKeyError extends Error {}

function key(): Buffer {
  const raw = (process.env.DOCUMENT_ENCRYPTION_KEY ?? "").trim();
  if (!raw) throw new DocumentKeyError("DOCUMENT_ENCRYPTION_KEY is not set");
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new DocumentKeyError("DOCUMENT_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters)");
  return buf;
}

export const isDocumentStorageConfigured = (): boolean => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};

const aad = (submissionId: string, kind: string) => Buffer.from(`lumiritin-doc:v1:${submissionId}:${kind}`, "utf8");

export const sha256Hex = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export function encryptDocument(plain: Uint8Array, submissionId: string, kind: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(submissionId, kind));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

/** Throws if the blob was tampered with, belongs to another submission/kind, or the key is wrong. */
export function decryptDocument(blob: Uint8Array, submissionId: string, kind: string): Buffer {
  const b = Buffer.from(blob);
  if (b.length < 1 + IV_LEN + TAG_LEN || b[0] !== VERSION) throw new Error("Unrecognised document format");
  const iv = b.subarray(1, 1 + IV_LEN);
  const tag = b.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(aad(submissionId, kind));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(b.subarray(1 + IV_LEN + TAG_LEN)), decipher.final()]);
}

// ── Upload rules ────────────────────────────────────────────────────────────

export const DOCUMENT_MEDIA = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
/** Per file. The browser shrinks photos before upload; Vercel caps a whole request at ~4.5 MB. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Checks the declared type AND the file's first bytes, so a renamed file can't pass as an image or PDF. */
export function sniffDocumentType(bytes: Uint8Array): (typeof DOCUMENT_MEDIA)[number] | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}
