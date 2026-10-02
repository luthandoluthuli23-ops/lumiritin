// Role → route mapping. Pure, so the edge middleware and server code share one definition.

export type Role = "PASSENGER" | "OPERATOR" | "PILOT";

export const ROLE_LABEL: Record<Role, string> = {
  PASSENGER: "Passenger",
  OPERATOR: "Aircraft Operator",
  PILOT: "Pilot / Crew",
};

export const ROLE_HOME: Record<Role, string> = {
  PASSENGER: "/dashboard/bookings",
  OPERATOR: "/operator/dashboard",
  PILOT: "/wallet",
};

/** Which role a path is reserved for, or null if it is public. */
export function requiredRole(pathname: string): Role | null {
  if (pathname === "/operator" || pathname.startsWith("/operator/")) return "OPERATOR";
  if (pathname === "/wallet" || pathname.startsWith("/wallet/")) return "PILOT";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "PASSENGER";
  return null;
}

export const isRole = (v: unknown): v is Role => v === "PASSENGER" || v === "OPERATOR" || v === "PILOT";

/** Accepts only same-site relative paths; anything else (absolute URLs, //host, backslashes) becomes null. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

/** Where to send a freshly signed-in user: their requested page if their role may see it, else their home. */
export function postLoginPath(role: Role, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  if (!safe) return ROLE_HOME[role];
  const needed = requiredRole(safe.split(/[?#]/)[0]);
  return needed === null || needed === role ? safe : ROLE_HOME[role];
}
