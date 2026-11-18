-- Logbook hours were stored as DECIMAL(5,1), so 1.25 h was silently saved as 1.3 and 1:20 (1.3333 h) as 1.3. Widen to
-- DECIMAL(9,4) (exact to 0.0001 h, a third of a second). Widening never loses data: existing values are kept as they
-- are. Idempotent (re-running ALTER ... TYPE to the same type is a no-op). Applied by hand.
ALTER TABLE "flight_log_entry"
  ALTER COLUMN "totalHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "picHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "coPilotHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "dualHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "instructorHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "nightHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "instrumentHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "multiEngineHours" TYPE DECIMAL(9,4),
  ALTER COLUMN "turbineHours" TYPE DECIMAL(9,4);

-- The brought-forward opening balance had the same one-decimal limit (DECIMAL(8,1)).
ALTER TABLE "logbook_summary"
  ALTER COLUMN "totalHours" TYPE DECIMAL(10,4),
  ALTER COLUMN "picHours" TYPE DECIMAL(10,4),
  ALTER COLUMN "multiEngineHours" TYPE DECIMAL(10,4),
  ALTER COLUMN "turbineHours" TYPE DECIMAL(10,4),
  ALTER COLUMN "instrumentHours" TYPE DECIMAL(10,4),
  ALTER COLUMN "nightHours" TYPE DECIMAL(10,4);
