// Who may open the verification review queue and the uploaded documents: signed-in users whose email is listed in
// REVIEWER_EMAILS (comma separated). No new role, no sign-up path: you add someone by editing the variable in Vercel.
import "server-only";
import { db } from "@/lib/db";
import { isReviewerEmail } from "@/lib/reviewer-allowlist";
import { getSession } from "@/lib/session";

export { isReviewerEmail };

/** The signed-in reviewer's email, or null (pages turn this into a 404, APIs into 403). */
export async function getReviewer(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { email: true } });
  return user && isReviewerEmail(user.email) ? user.email.toLowerCase() : null;
}
