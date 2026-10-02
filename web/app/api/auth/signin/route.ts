import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { dummyHash, verifyPassword } from "@/lib/password";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { postLoginPath } from "@/lib/roles";
import { startSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(128),
  next: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  const { email, password, next } = parsed.data;

  // Limit by IP and by target account, so one address cannot be hammered from many IPs either.
  if (isRateLimited(`signin:ip:${clientIp(req)}`, 20, 15 * 60_000) || isRateLimited(`signin:email:${email}`, 8, 15 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always run one scrypt comparison so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  await startSession(user);
  return NextResponse.json({ redirect: postLoginPath(user.role, next) });
}
