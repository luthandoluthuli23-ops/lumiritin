import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { parseResetToken, resetSignatureValid } from "@/lib/password-reset";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { ROLE_HOME } from "@/lib/roles";
import { startSession } from "@/lib/session";

const schema = z.object({ token: z.string().min(1).max(512), password: z.string().min(10, "use at least 10 characters").max(128) });
const invalid = () => NextResponse.json({ error: "reset_link_invalid" }, { status: 400 });

/** POST { token, password } — sets a new password from a reset link, then signs the user in. */
export async function POST(req: NextRequest) {
  if (isRateLimited(`reset:ip:${clientIp(req)}`, 20, 15 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const t = parseResetToken(parsed.data.token);
  if (!t) return invalid();
  const user = await db.user.findUnique({ where: { id: t.userId } });
  if (!user || !resetSignatureValid(t, user.passwordHash)) return invalid();

  const passwordHash = await hashPassword(parsed.data.password);
  // Conditional on the old hash, so the same link can't be used twice, even by two requests at once.
  const done = await db.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash } });
  if (done.count === 0) return invalid();
  await startSession(user);
  return NextResponse.json({ redirect: ROLE_HOME[user.role] });
}
