/** Pure: is this email on the reviewer allowlist (REVIEWER_EMAILS, comma separated)? Case-insensitive; empty = nobody. */
export function isReviewerEmail(email: string | null | undefined, list: string | undefined = process.env.REVIEWER_EMAILS): boolean {
  if (!email) return false;
  const allowed = (list ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
  return allowed.includes(email.trim().toLowerCase());
}
