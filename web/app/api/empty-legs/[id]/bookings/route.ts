import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SEAT_HOLDING_STATUSES, remainingSeats } from "@/lib/empty-legs-shared";

const bookingSchema = z.object({
  passengerName: z.string().trim().min(2).max(120),
  passengerEmail: z.string().trim().toLowerCase().pipe(z.email()),
  passengerPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  seats: z.number().int().min(1).max(20),
});

class BookingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

/** POST /api/empty-legs/:id/bookings — a passenger requests seats. Creates a PENDING booking the operator confirms. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  const input = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      // Lock the leg row so two simultaneous requests cannot both claim the last seat.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM empty_leg WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new BookingError(404, "not_found");

      const leg = await tx.emptyLeg.findUniqueOrThrow({ where: { id } });
      if (leg.status === "CANCELLED") throw new BookingError(409, "leg_cancelled");
      if (leg.departureEnd.getTime() < Date.now()) throw new BookingError(409, "leg_departed");

      const held = await tx.emptyLegBooking.aggregate({
        where: { emptyLegId: id, status: { in: [...SEAT_HOLDING_STATUSES] } },
        _sum: { seats: true },
      });
      const left = remainingSeats(leg.seatsOffered, held._sum.seats ?? 0);
      if (input.seats > left) throw new BookingError(409, "not_enough_seats", `${left} seat(s) remaining`);

      const booking = await tx.emptyLegBooking.create({
        data: {
          emptyLegId: id,
          passengerName: input.passengerName,
          passengerEmail: input.passengerEmail,
          passengerPhone: input.passengerPhone,
          seats: input.seats,
        },
        select: { id: true, seats: true, status: true },
      });

      const remaining = left - input.seats;
      if (remaining === 0) await tx.emptyLeg.update({ where: { id }, data: { status: "SOLD_OUT" } });

      return {
        booking,
        remainingSeats: remaining,
        totalZar: input.seats * leg.discountedPricePerSeatZar,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, detail: err.detail }, { status: err.status });
    }
    throw err;
  }
}
