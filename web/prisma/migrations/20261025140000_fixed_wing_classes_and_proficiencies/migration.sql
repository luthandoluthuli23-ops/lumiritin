-- Fixed-wing aircraft classes (hidden in the charter UI until launch) and pilot proficiencies.
ALTER TYPE "AircraftClass" ADD VALUE IF NOT EXISTS 'TURBOPROP';
ALTER TYPE "AircraftClass" ADD VALUE IF NOT EXISTS 'LIGHT_JET';
ALTER TYPE "AircraftClass" ADD VALUE IF NOT EXISTS 'MIDSIZE_JET';
ALTER TYPE "AircraftClass" ADD VALUE IF NOT EXISTS 'HEAVY_JET';

ALTER TABLE "person" ADD COLUMN IF NOT EXISTS "proficiencies" TEXT[] NOT NULL DEFAULT '{}';
