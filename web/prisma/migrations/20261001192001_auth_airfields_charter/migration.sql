-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PASSENGER', 'OPERATOR', 'PILOT');

-- CreateEnum
CREATE TYPE "HangarStatus" AS ENUM ('HUB', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_LEG');

-- CreateEnum
CREATE TYPE "AircraftClass" AS ENUM ('VERY_LIGHT_JET', 'LIGHT_JET', 'MIDSIZE_JET', 'HEAVY_JET', 'TURBOPROP');

-- CreateEnum
CREATE TYPE "CharterStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "aircraft" ADD COLUMN     "hourlyRateZar" INTEGER;

-- AlterTable
ALTER TABLE "operator" ADD COLUMN     "baseIcao" TEXT;

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "homeAirfieldIcao" TEXT,
    "personId" TEXT,
    "operatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airfield" (
    "icao" TEXT NOT NULL,
    "iata" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ZA',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "hangarStatus" "HangarStatus" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "airfield_pkey" PRIMARY KEY ("icao")
);

-- CreateTable
CREATE TABLE "charter_booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "tripType" "TripType" NOT NULL,
    "aircraftClass" "AircraftClass" NOT NULL,
    "passengers" INTEGER NOT NULL,
    "legs" JSONB NOT NULL,
    "totalDistanceNm" INTEGER NOT NULL,
    "estimatedPriceZar" INTEGER NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "notes" TEXT,
    "status" "CharterStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charter_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_personId_key" ON "app_user"("personId");

-- CreateIndex
CREATE INDEX "app_user_operatorId_idx" ON "app_user"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "airfield_iata_key" ON "airfield"("iata");

-- CreateIndex
CREATE UNIQUE INDEX "charter_booking_reference_key" ON "charter_booking"("reference");

-- CreateIndex
CREATE INDEX "charter_booking_status_createdAt_idx" ON "charter_booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "charter_booking_userId_idx" ON "charter_booking"("userId");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charter_booking" ADD CONSTRAINT "charter_booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
