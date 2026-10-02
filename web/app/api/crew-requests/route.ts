import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AIRCRAFT_TYPES } from "@/lib/empty-legs-shared";
import { getOperatorContext } from "@/lib/session";

const TYPES = AIRCRAFT_TYPES.map(([code]) => code);

const schema = z.object({
  role: z.enum(["PILOT", "CABIN_CREW", "AME", "GROUND_CREW"]),
  /** ICAO type designator from the dropdown. The pilot must hold an exact rating for it. */
  aircraftType: z.string().refine((v) => TYPES.includes(v), "choose an aircraft type from the list"),
  aircraftId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
  departureIcao: z.string().trim().toUpperCase(),
  startsAt: z.coerce.date(),
  hoursRequired: z.number().int().min(1).max(24),
  minTotalHours: z.number().int().min(0).max(30_000).optional(),
});

const issue = (path: string, message: string, status = 422) =>
  NextResponse.json({ error: "validation_failed", issues: [{ path, message }] }, { status });

/**
 * POST /api/crew-requests — a signed-in operator creates a crew request (not yet dispatched).
 * The end time is derived: startsAt + hoursRequired.
 */
export async function POST(req: NextRequest) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const input = parsed.data;

  if (input.startsAt.getTime() <= Date.now()) return issue("startsAt", "must be in the future");
  if (!(await db.airfield.findUnique({ where: { icao: input.departureIcao }, select: { icao: true } }))) return issue("departureIcao", "unknown airfield");
  if (input.aircraftId) {
    const own = await db.aircraft.findFirst({ where: { id: input.aircraftId, operatorId: operator.operatorId }, select: { id: true } });
    if (!own) return issue("aircraftId", "not one of your aircraft");
  }

  const created = await db.crewRequest.create({
    data: {
      operatorId: operator.operatorId,
      aircraftId: input.aircraftId,
      role: input.role,
      requiredRatings: [input.aircraftType],
      minTotalHours: input.minTotalHours,
      departureIcao: input.departureIcao,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + input.hoursRequired * 3_600_000),
      hoursRequired: input.hoursRequired,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
