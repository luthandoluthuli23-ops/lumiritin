import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ROLE_HOME, isRole } from "@/lib/roles";
import { startSession } from "@/lib/session";

const DEMO_EMAIL = {
  PASSENGER: "demo.passenger@example.com",
  OPERATOR: "demo.operator@example.com",
  PILOT: "demo.pilot@example.com",
} as const;

/**
 * Dev-only role switcher: signs in as the seeded demo user for a role, with no password.
 * Hard-disabled in production builds, so it cannot be used as a back door.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

  const body = (await req.json().catch(() => null)) as { role?: unknown } | null;
  if (!isRole(body?.role)) return NextResponse.json({ error: "invalid_role" }, { status: 422 });

  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL[body.role] } });
  if (!user) return NextResponse.json({ error: "demo_user_missing", hint: "run npm run db:seed" }, { status: 404 });

  await startSession(user);
  return NextResponse.json({ redirect: ROLE_HOME[user.role] });
}
