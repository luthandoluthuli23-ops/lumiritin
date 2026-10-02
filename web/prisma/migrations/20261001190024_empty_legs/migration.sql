-- CreateEnum
CREATE TYPE "EmptyLegStatus" AS ENUM ('OPEN', 'SOLD_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "aircraft" ADD COLUMN     "seatCapacity" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "empty_leg" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "originIcao" TEXT NOT NULL,
    "destinationIcao" TEXT NOT NULL,
    "departureStart" TIMESTAMP(3) NOT NULL,
    "departureEnd" TIMESTAMP(3) NOT NULL,
    "seatsOffered" INTEGER NOT NULL,
    "standardPricePerSeatZar" INTEGER NOT NULL,
    "discountedPricePerSeatZar" INTEGER NOT NULL,
    "status" "EmptyLegStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empty_leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empty_leg_booking" (
    "id" TEXT NOT NULL,
    "emptyLegId" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerEmail" TEXT NOT NULL,
    "passengerPhone" TEXT,
    "seats" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empty_leg_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "empty_leg_status_departureStart_idx" ON "empty_leg"("status", "departureStart");

-- CreateIndex
CREATE INDEX "empty_leg_operatorId_idx" ON "empty_leg"("operatorId");

-- CreateIndex
CREATE INDEX "empty_leg_booking_emptyLegId_status_idx" ON "empty_leg_booking"("emptyLegId", "status");

-- AddForeignKey
ALTER TABLE "empty_leg" ADD CONSTRAINT "empty_leg_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empty_leg" ADD CONSTRAINT "empty_leg_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empty_leg_booking" ADD CONSTRAINT "empty_leg_booking_emptyLegId_fkey" FOREIGN KEY ("emptyLegId") REFERENCES "empty_leg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
