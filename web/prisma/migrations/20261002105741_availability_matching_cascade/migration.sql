-- CreateEnum
CREATE TYPE "AvailabilityState" AS ENUM ('AVAILABLE', 'BOOKED');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('MANUAL', 'BOOKING', 'OPERATOR', 'ICAL');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('INVITED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "PingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "availability" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "crewRequestId" TEXT,
ADD COLUMN     "operatorId" TEXT,
ADD COLUMN     "source" "AvailabilitySource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "state" "AvailabilityState" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "icalLastError" TEXT,
ADD COLUMN     "icalSyncedAt" TIMESTAMP(3),
ADD COLUMN     "icalUrl" TEXT;

-- AlterTable
ALTER TABLE "request" ADD COLUMN     "assignedPersonId" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "filledAt" TIMESTAMP(3),
ADD COLUMN     "hoursRequired" INTEGER NOT NULL DEFAULT 4;

-- CreateTable
CREATE TABLE "crew_roster" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'INVITED',
    "sharedToPool" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_roster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_ping" (
    "id" TEXT NOT NULL,
    "crewRequestId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "PingStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "whatsappSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "crew_ping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bench_earning" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "crewRequestId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "hoursBilled" INTEGER NOT NULL,
    "amountZar" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bench_earning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crew_roster_personId_idx" ON "crew_roster"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "crew_roster_operatorId_personId_key" ON "crew_roster"("operatorId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "crew_ping_token_key" ON "crew_ping"("token");

-- CreateIndex
CREATE INDEX "crew_ping_personId_status_idx" ON "crew_ping"("personId", "status");

-- CreateIndex
CREATE INDEX "crew_ping_status_expiresAt_idx" ON "crew_ping"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "crew_ping_crewRequestId_personId_key" ON "crew_ping"("crewRequestId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "bench_earning_crewRequestId_key" ON "bench_earning"("crewRequestId");

-- CreateIndex
CREATE INDEX "bench_earning_operatorId_createdAt_idx" ON "bench_earning"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "availability_personId_source_idx" ON "availability"("personId", "source");

-- AddForeignKey
ALTER TABLE "crew_roster" ADD CONSTRAINT "crew_roster_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_roster" ADD CONSTRAINT "crew_roster_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_ping" ADD CONSTRAINT "crew_ping_crewRequestId_fkey" FOREIGN KEY ("crewRequestId") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_ping" ADD CONSTRAINT "crew_ping_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bench_earning" ADD CONSTRAINT "bench_earning_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bench_earning" ADD CONSTRAINT "bench_earning_crewRequestId_fkey" FOREIGN KEY ("crewRequestId") REFERENCES "request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
