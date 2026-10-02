import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ICAO_RE } from "@/lib/airfields";
import { getEmptyLegCard, listOpenEmptyLegs } from "@/lib/empty-legs";
import { getOperatorContext, getSession } from "@/lib/session";
import { MAX_DISCOUNT_PERCENT, discountPercent, type EmptyLegCard } from "@/lib/empty-legs-shared";

export const dynamic = "force-dynamic";

const icao = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(ICAO_RE, "must be a 4-letter ICAO code, e.g. FALA"));

const createEmptyLegSchema = z
  .object({
    aircraftId: z.string().min(1),
    originIcao: icao,
    destinationIcao: icao,
    departureStart: z.coerce.date(),
    departureEnd: z.coerce.date(),
    /** Defaults to the aircraft's full seat capacity. */
    seatsOffered: z.number().int().min(1).optional(),
    standardPricePerSeatZar: z.number().int().positive(),
    discountedPricePerSeatZar: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.originIcao === v.destinationIcao) bad("destinationIcao", "must differ from the origin");
    if (v.departureStart.getTime() <= Date.now()) bad("departureStart", "must be in the future");
    if (v.departureEnd.getTime() <= v.departureStart.getTime()) bad("departureEnd", "must be after departureStart");
    if (v.discountedPricePerSeatZar >= v.standardPricePerSeatZar) {
      bad("discountedPricePerSeatZar", "must be lower than the standard price");
    } else if (discountPercent(v.standardPricePerSeatZar, v.discountedPricePerSeatZar) > MAX_DISCOUNT_PERCENT) {
      bad("discountedPricePerSeatZar", `discount cannot exceed ${MAX_DISCOUNT_PERCENT}%`);
    }
  });

type ApiError = { error: string; issues?: { path: string; message: string }[] };
const fail = (status: number, error: string, issues?: ApiError["issues"]) =>
  NextResponse.json<ApiError>({ error, issues }, { status });

/** POST /api/empty-legs — a signed-in operator publishes a repositioning flight for one of their own aircraft. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail(401, "unauthorised");
  const operator = await getOperatorContext();
  if (!operator) return fail(403, "forbidden");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }

  const parsed = createEmptyLegSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      422,
      "validation_failed",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const input = parsed.data;

  const aircraft = await db.aircraft.findUnique({
    where: { id: input.aircraftId },
    select: { operatorId: true, seatCapacity: true },
  });
  if (!aircraft || aircraft.operatorId !== operator.operatorId) {
    return fail(404, "aircraft_not_found_for_operator");
  }

  // Seat availability: everything sold up front is bounded by the cabin; default is the full cabin.
  const seatsOffered = input.seatsOffered ?? aircraft.seatCapacity;
  if (seatsOffered > aircraft.seatCapacity) {
    return fail(422, "validation_failed", [
      { path: "seatsOffered", message: `exceeds aircraft capacity of ${aircraft.seatCapacity}` },
    ]);
  }

  // The same aircraft cannot be on two overlapping live empty legs.
  const clash = await db.emptyLeg.findFirst({
    where: {
      aircraftId: input.aircraftId,
      status: { not: "CANCELLED" },
      departureStart: { lt: input.departureEnd },
      departureEnd: { gt: input.departureStart },
    },
    select: { id: true },
  });
  if (clash) return fail(409, "aircraft_already_scheduled_in_window");

  const created = await db.emptyLeg.create({
    data: {
      operatorId: operator.operatorId,
      aircraftId: input.aircraftId,
      originIcao: input.originIcao,
      destinationIcao: input.destinationIcao,
      departureStart: input.departureStart,
      departureEnd: input.departureEnd,
      seatsOffered,
      standardPricePerSeatZar: input.standardPricePerSeatZar,
      discountedPricePerSeatZar: input.discountedPricePerSeatZar,
    },
    select: { id: true },
  });

  const card = await getEmptyLegCard(created.id);
  return NextResponse.json<EmptyLegCard | null>(card, { status: 201 });
}

/** GET /api/empty-legs?origin=FALA&destination=FACT — open legs, optionally filtered by ICAO. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const origin = q.get("origin")?.toUpperCase();
  const destination = q.get("destination")?.toUpperCase();
  const legs = await listOpenEmptyLegs({
    ...(origin && ICAO_RE.test(origin) ? { originIcao: origin } : {}),
    ...(destination && ICAO_RE.test(destination) ? { destinationIcao: destination } : {}),
  });
  return NextResponse.json({ count: legs.length, legs });
}
