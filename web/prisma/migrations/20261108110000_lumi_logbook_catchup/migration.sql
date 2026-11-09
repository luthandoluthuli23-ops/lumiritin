-- Catch-up migration. These objects have been in prisma/schema.prisma since the Lumi document verification and pilot
-- logbook commits, but no migration file ever created them, so `prisma migrate deploy` on an empty database failed
-- at 20261108120000 ("relation flight_log_entry does not exist") and a database built from the earlier migrations
-- was missing them. Everything here is idempotent (IF NOT EXISTS / guarded blocks) so it is safe to paste into the
-- Supabase SQL editor on a database that already has some of it. Migrations are applied by hand.

-- Lumi document verification: how a credential's last VERIFIED result was obtained.
DO $$ BEGIN
  CREATE TYPE "VerificationMethod" AS ENUM ('SACAA_PORTAL', 'LUMI_DOCUMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "credential" ADD COLUMN IF NOT EXISTS "lastVerificationMethod" "VerificationMethod";

-- Pilot logbook: where a logged flight came from, and the pilot's existing logbook provenance.
DO $$ BEGIN
  CREATE TYPE "FlightLogSource" AS ENUM ('PLATFORM', 'IMPORTED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "person"
  ADD COLUMN IF NOT EXISTS "logbookProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "logbookRef" TEXT;

CREATE TABLE IF NOT EXISTS "flight_log_entry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "departureIcao" TEXT,
    "arrivalIcao" TEXT,
    "aircraftType" TEXT,
    "aircraftReg" TEXT,
    "operatorName" TEXT,
    "totalHours" DECIMAL(5,1) NOT NULL,
    "picHours" DECIMAL(5,1),
    "coPilotHours" DECIMAL(5,1),
    "dualHours" DECIMAL(5,1),
    "instructorHours" DECIMAL(5,1),
    "nightHours" DECIMAL(5,1),
    "instrumentHours" DECIMAL(5,1),
    "multiEngineHours" DECIMAL(5,1),
    "turbineHours" DECIMAL(5,1),
    "dayLandings" INTEGER NOT NULL DEFAULT 0,
    "nightLandings" INTEGER NOT NULL DEFAULT 0,
    "certifier" TEXT,
    "source" "FlightLogSource" NOT NULL DEFAULT 'MANUAL',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "crewRequestId" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flight_log_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "flight_log_entry_crewRequestId_key" ON "flight_log_entry"("crewRequestId");
CREATE INDEX IF NOT EXISTS "flight_log_entry_personId_date_idx" ON "flight_log_entry"("personId", "date");

DO $$ BEGIN
  ALTER TABLE "flight_log_entry" ADD CONSTRAINT "flight_log_entry_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase exposes the public schema through its Data API; keep that API out of the pilot's flight log.
-- The app connects as the table owner (Prisma), which bypasses RLS, so it is unaffected.
ALTER TABLE "flight_log_entry" ENABLE ROW LEVEL SECURITY;
