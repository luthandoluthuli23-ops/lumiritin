import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, requiredRole } from "@/lib/roles";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// Route guards: /operator/* → OPERATOR, /wallet/* → PILOT, /dashboard/* → PASSENGER.
// This is the first line of defence; pages and API handlers re-check the session themselves.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needed = requiredRole(pathname);
  if (!needed) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = new URL("/auth/signin", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (session.role !== needed) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/operator/:path*", "/wallet/:path*", "/dashboard/:path*"],
};
