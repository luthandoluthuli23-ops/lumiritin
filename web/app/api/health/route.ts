import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — deployment diagnostics. Reports whether required settings are present (booleans only, never
 * values) and whether the database is reachable and migrated. Returns 503 if anything is wrong.
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    SESSION_SECRET: (process.env.SESSION_SECRET?.length ?? 0) >= 32,
    APP_BASE_URL: Boolean(process.env.APP_BASE_URL),
  };

  let database: { status: "ok"; airfields: number } | { status: "error"; code: string; hint: string };
  try {
    database = { status: "ok", airfields: await db.airfield.count() };
  } catch (err) {
    const code = (err as { errorCode?: string; code?: string; name?: string }).errorCode ?? (err as { code?: string }).code ?? (err as Error).name ?? "unknown";
    const hints: Record<string, string> = {
      P1000: "The database rejected the username or password in DATABASE_URL.",
      P1001: "The database server could not be reached. Check the host in DATABASE_URL.",
      P1002: "The database server timed out.",
      P1003: "The database named in DATABASE_URL does not exist.",
      P1017: "The database closed the connection.",
      P2021: "Connected, but the tables are missing. Run `prisma migrate deploy` against this database.",
      P2022: "Connected, but the schema is out of date. Run `prisma migrate deploy`.",
      PrismaClientInitializationError: "The Prisma client could not start. DATABASE_URL is probably missing or malformed.",
    };
    database = { status: "error", code, hint: hints[code] ?? "See the server logs for details." };
  }

  const ok = Object.values(env).every(Boolean) && database.status === "ok" && database.airfields > 0;
  const missingAirfields = database.status === "ok" && database.airfields === 0;
  return NextResponse.json(
    { ok, env, database, ...(missingAirfields ? { hint: "No airfields found. Run `npm run db:seed:airfields`." } : {}) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
