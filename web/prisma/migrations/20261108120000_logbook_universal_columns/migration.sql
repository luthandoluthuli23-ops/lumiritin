-- Universal pilot logbook columns: co-pilot/SIC time, instructor time, and the CFI/PIC certifier
-- signature line. Mirrors the universal_pilot_logbook_template layout. Applied manually to Supabase
-- via the SQL editor, like the other migrations here.
ALTER TABLE "flight_log_entry"
  ADD COLUMN IF NOT EXISTS "coPilotHours" DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS "instructorHours" DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS "certifier" TEXT;
