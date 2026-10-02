import { randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ICAO_RE } from "@/lib/airfields";
import { MAX_MULTI_LEGS, aircraftClass, computeQuote, legDistanceNm } from "@/lib/charter";
import { toE164 } from "@/lib/phone";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import { sastDate } from "@/lib/empty-legs-shared";

const icao = z.string().trim().toUpperCase().pipe(z.string().regex(ICAO_RE, "must be a 4-letter ICAO code"));
const leg = z.object({
  fromIcao: icao,
  toIcao: icao,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD"),
});

const schema = z.object({
  tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "MULTI_LEG"]),
  aircraftClass: z.enum(["VERY_LIGHT_JET", "LIGHT_JET", "MIDSIZE_JET", "HEAVY_JET", "TURBOPROP"]),
  passengers: z.number().int().min(1).max(20),
  legs: z.array(leg).min(1).max(MAX_MULTI_LEGS),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()),
  contactPhone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const e164 = toE164(v);
      if (!e164) ctx.addIssue({ code: "custom", message: "enter a valid phone number" });
      return e164 ?? z.NEVER;
    })
    .optional(),
  notes: z.string().trim().max(1000).optional(),
});

type Issue = { path: string; message: string };
const fail = (status: number, error: string, issues?: Issue[], detail?: string) =>
  NextResponse.json({ error, issues, detail }, { status });

// Reference like LUM-2026-X981: letter (no I or O) + 3 digits. That is about 22,000 per year, so the
// retry loop below handles collisions today but the format will need a longer suffix once volume grows.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function newReference(): string {
  const year = new Date().getFullYear();
  return `LUM-${year}-${LETTERS[randomInt(LETTERS.length)]}${String(randomInt(1000)).padStart(3, "0")}`;
}

/** POST /api/charter/quote — validates a trip, computes the estimate server-side and saves a CharterBooking. */
export async function POST(req: NextRequest) {
  // 10 requests per 10 minutes per IP in production; relaxed in development so automated tests can run.
  const max = process.env.NODE_ENV === "production" ? 10 : 500;
  if (isRateLimited(`quote:${clientIp(req)}`, max, 10 * 60_000)) return fail(429, "rate_limited");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "validation_failed", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const input = parsed.data;
  const bad = (path: string, message: string) => fail(422, "validation_failed", [{ path, message }]);

  // Trip shape.
  const { legs } = input;
  if (input.tripType === "ONE_WAY" && legs.length !== 1) return bad("legs", "a one-way trip has exactly one leg");
  if (input.tripType === "MULTI_LEG" && legs.length < 2) return bad("legs", "a multi-leg trip needs at least two legs");
  if (input.tripType === "ROUND_TRIP") {
    if (legs.length !== 2) return bad("legs", "a round trip has an outbound and a return leg");
    if (legs[1].fromIcao !== legs[0].toIcao || legs[1].toIcao !== legs[0].fromIcao) return bad("legs.1", "the return leg must reverse the outbound leg");
  }
  const today = sastDate(new Date().toISOString());
  for (const [i, l] of legs.entries()) {
    if (l.fromIcao === l.toIcao) return bad(`legs.${i}.toIcao`, "must differ from the departure airfield");
    if (l.date < today) return bad(`legs.${i}.date`, "must not be in the past");
    if (i > 0 && l.date < legs[i - 1].date) return bad(`legs.${i}.date`, "must not be before the previous leg");
  }

  // Every ICAO code must be a real airfield we hold coordinates for.
  const codes = [...new Set(legs.flatMap((l) => [l.fromIcao, l.toIcao]))];
  const airfields = await db.airfield.findMany({ where: { icao: { in: codes } } });
  const byIcao = new Map(airfields.map((a) => [a.icao, a]));
  const unknown = codes.filter((c) => !byIcao.has(c));
  if (unknown.length) return fail(422, "unknown_airfield", [{ path: "legs", message: `unknown airfield: ${unknown.join(", ")}` }]);

  // Estimate. Computed here from our own data; the client's preview is never trusted.
  const spec = aircraftClass(input.aircraftClass)!;
  const distances = legs.map((l) => legDistanceNm(byIcao.get(l.fromIcao)!, byIcao.get(l.toIcao)!));
  const result = computeQuote(distances, spec, input.passengers);
  if (!result.ok) return fail(422, result.reason, undefined, result.detail);
  const { quote } = result;

  const session = await getSession();
  const storedLegs = legs.map((l, i) => ({ ...l, distanceNm: distances[i] }));

  for (let attempt = 0; attempt < 8; attempt++) {
    const reference = newReference();
    try {
      await db.charterBooking.create({
        data: {
          reference,
          userId: session?.sub,
          tripType: input.tripType,
          aircraftClass: input.aircraftClass,
          passengers: input.passengers,
          legs: storedLegs satisfies Prisma.InputJsonValue,
          totalDistanceNm: quote.totalDistanceNm,
          estimatedPriceZar: quote.priceZar,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          notes: input.notes || undefined,
        },
      });
      return NextResponse.json({ reference, status: "REQUESTED", quote, legs: storedLegs }, { status: 201 });
    } catch (err) {
      const duplicateRef = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!duplicateRef) throw err;
    }
  }
  return fail(503, "reference_generation_failed");
}
