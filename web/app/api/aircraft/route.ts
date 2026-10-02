import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ICAO_RE } from "@/lib/airfields";
import { getOperatorContext } from "@/lib/session";

const schema = z.object({
  registration: z.string().trim().toUpperCase().pipe(z.string().regex(/^Z[SU]-[A-Z]{3}$/, "use a South African registration like ZS-PRV")),
  typeDesignator: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9]{2,4}$/, "ICAO type designator, e.g. C525")),
  baseIcao: z.string().trim().toUpperCase().pipe(z.string().regex(ICAO_RE, "must be a 4-letter ICAO code")),
  seatCapacity: z.number().int().min(1).max(19),
  hourlyRateZar: z.number().int().min(1000).max(1_000_000),
});

/** POST /api/aircraft — a signed-in operator registers an aircraft in their fleet. */
export async function POST(req: NextRequest) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const input = parsed.data;

  if (!(await db.airfield.findUnique({ where: { icao: input.baseIcao }, select: { icao: true } }))) {
    return NextResponse.json({ error: "validation_failed", issues: [{ path: "baseIcao", message: "unknown airfield" }] }, { status: 422 });
  }

  try {
    const aircraft = await db.aircraft.create({ data: { ...input, operatorId: operator.operatorId } });
    return NextResponse.json({ id: aircraft.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "validation_failed", issues: [{ path: "registration", message: "already registered" }] }, { status: 409 });
    }
    throw err;
  }
}
