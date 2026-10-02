/**
 * Normalises a phone number to E.164. South African local numbers (0821234567) become +27821234567.
 * Returns null if the result is not 8–15 digits after the plus sign.
 */
export function toE164(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, "");
  const intl = cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned.startsWith("0") ? `+27${cleaned.slice(1)}` : cleaned;
  return /^\+[1-9]\d{7,14}$/.test(intl) ? intl : null;
}
