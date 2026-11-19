import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendPasswordResetEmail, siteUrl } from "@/lib/email";
import { createResetToken } from "@/lib/password-reset";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

/**
 * POST { email } — emails a reset link if the account exists. Always answers the same way, so it can't be used to
 * find out who has an account.
 */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed", issues: [{ path: "", message: "Enter a valid email address." }] }, { status: 422 });
  const { email } = parsed.data;
  if (isRateLimited(`forgot:ip:${clientIp(req)}`, 10, 60 * 60_000) || isRateLimited(`forgot:email:${email}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  after(async () => {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, firstName: true, passwordHash: true } });
    if (!user) return;
    const link = siteUrl(`/auth/reset?token=${encodeURIComponent(createResetToken(user))}`);
    const r = await sendPasswordResetEmail({ to: email, name: user.firstName, link });
    if (!r.ok) console.error("[forgot] reset email not sent:", r.error);
  });
  return NextResponse.json({ ok: true });
}
