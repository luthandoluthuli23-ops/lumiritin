-- Repurpose AircraftClass from fixed-wing jets to helicopters.
-- RENAME VALUE preserves existing charter_booking rows (the labels change in place).
ALTER TYPE "AircraftClass" RENAME VALUE 'VERY_LIGHT_JET' TO 'LIGHT_HELI';
ALTER TYPE "AircraftClass" RENAME VALUE 'LIGHT_JET' TO 'MEDIUM_HELI';
ALTER TYPE "AircraftClass" RENAME VALUE 'MIDSIZE_JET' TO 'HEAVY_HELI';
ALTER TYPE "AircraftClass" RENAME VALUE 'HEAVY_JET' TO 'SUPER_HELI';
ALTER TYPE "AircraftClass" RENAME VALUE 'TURBOPROP' TO 'UTILITY_HELI';
