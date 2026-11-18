-- Verification state-change messages (Task 5): remember the last state each pilot was told about, so a change is
-- announced exactly once (claimed with a conditional update). Idempotent; applied by hand.
ALTER TABLE "person"
  ADD COLUMN IF NOT EXISTS "notifiedState" TEXT,
  ADD COLUMN IF NOT EXISTS "notifiedStateAt" TIMESTAMP(3);
