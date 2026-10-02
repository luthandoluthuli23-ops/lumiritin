import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  SEAT_HOLDING_STATUSES,
  discountPercent,
  remainingSeats,
  type EmptyLegCard,
} from "@/lib/empty-legs-shared";

const cardInclude = {
  operator: { select: { name: true } },
  aircraft: { select: { registration: true, typeDesignator: true } },
  bookings: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } }, select: { seats: true } },
} satisfies Prisma.EmptyLegInclude;

export type EmptyLegWithRelations = Prisma.EmptyLegGetPayload<{ include: typeof cardInclude }>;

export function toCard(leg: EmptyLegWithRelations): EmptyLegCard {
  const booked = leg.bookings.reduce((sum, b) => sum + b.seats, 0);
  return {
    id: leg.id,
    originIcao: leg.originIcao,
    destinationIcao: leg.destinationIcao,
    departureStart: leg.departureStart.toISOString(),
    departureEnd: leg.departureEnd.toISOString(),
    aircraftType: leg.aircraft.typeDesignator,
    aircraftRegistration: leg.aircraft.registration,
    operatorName: leg.operator.name,
    seatsOffered: leg.seatsOffered,
    remainingSeats: remainingSeats(leg.seatsOffered, booked),
    standardPricePerSeatZar: leg.standardPricePerSeatZar,
    discountedPricePerSeatZar: leg.discountedPricePerSeatZar,
    discountPercent: discountPercent(leg.standardPricePerSeatZar, leg.discountedPricePerSeatZar),
  };
}

/** Bookable legs: open and not yet past their latest departure, soonest first. */
export async function listOpenEmptyLegs(where: Prisma.EmptyLegWhereInput = {}, take = 100): Promise<EmptyLegCard[]> {
  const legs = await db.emptyLeg.findMany({
    where: { status: "OPEN", departureEnd: { gte: new Date() }, ...where },
    include: cardInclude,
    orderBy: { departureStart: "asc" },
    take,
  });
  return legs.map(toCard);
}

export async function getEmptyLegCard(id: string): Promise<EmptyLegCard | null> {
  const leg = await db.emptyLeg.findUnique({ where: { id }, include: cardInclude });
  return leg ? toCard(leg) : null;
}

export const countOpenEmptyLegs = (): Promise<number> =>
  db.emptyLeg.count({ where: { status: "OPEN", departureEnd: { gte: new Date() } } });
