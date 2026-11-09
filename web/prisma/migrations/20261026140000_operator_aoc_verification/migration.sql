-- Operator AOC verification via Lumi (document). Applied manually to Supabase via the SQL editor.
ALTER TABLE "operator"
  ADD COLUMN IF NOT EXISTS "aocStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "aocVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aocSnapshot" JSONB;
