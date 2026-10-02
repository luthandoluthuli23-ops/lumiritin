import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ROLE_HOME, type Role } from "@/lib/roles";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession, type SessionPayload } from "@/lib/session-token";

/** The signed-in user's session, or null. Deduplicated per request. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
});

export async function startSession(user: { id: string; role: Role; firstName: string; lastName: string }): Promise<void> {
  const token = await signSession({ sub: user.id, role: user.role, name: `${user.firstName} ${user.lastName}`.trim() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** For pages: returns the session for `role`, or redirects (to sign-in, or to the user's own home). */
export async function requireRole(role: Role, returnTo?: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(`/auth/signin${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  if (session.role !== role) redirect(ROLE_HOME[session.role]);
  return session;
}

export interface OperatorContext {
  userId: string;
  operatorId: string;
  operatorName: string;
  baseIcao: string | null;
}

/** The signed-in operator admin and their operator, or null (API routes turn this into 401/403). */
export const getOperatorContext = cache(async (): Promise<OperatorContext | null> => {
  const session = await getSession();
  if (session?.role !== "OPERATOR") return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { operatorId: true, operator: { select: { name: true, baseIcao: true } } },
  });
  if (!user?.operatorId || !user.operator) return null;
  return { userId: session.sub, operatorId: user.operatorId, operatorName: user.operator.name, baseIcao: user.operator.baseIcao };
});

/** The signed-in pilot's Person id, or null (API routes turn this into 401/403). */
export const getPilotPersonId = cache(async (): Promise<string | null> => {
  const session = await getSession();
  if (session?.role !== "PILOT") return null;
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { personId: true } });
  return user?.personId ?? null;
});

/** For operator pages. */
export async function requireOperator(): Promise<OperatorContext> {
  await requireRole("OPERATOR");
  const ctx = await getOperatorContext();
  if (!ctx) redirect("/auth/signin");
  return ctx;
}
