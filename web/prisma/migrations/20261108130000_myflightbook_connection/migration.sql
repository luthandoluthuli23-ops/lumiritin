-- MyFlightbook connection: stored (encrypted) OAuth tokens per pilot, and a way to recognise a flight that was pulled
-- from an external logbook so a re-sync updates it in place instead of duplicating it. Idempotent; applied by hand.

-- flight_log_entry: (personId, externalSource, externalId) is unique. Manual / CSV / Lumi / platform rows leave both
-- columns NULL, and Postgres treats NULLs as distinct, so they never collide with each other.
ALTER TABLE "flight_log_entry"
  ADD COLUMN IF NOT EXISTS "externalSource" TEXT,
  ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "flight_log_entry_personId_externalSource_externalId_key"
  ON "flight_log_entry"("personId", "externalSource", "externalId");

-- external_connection: one row per pilot per provider. Tokens are AES-256-GCM ciphertext (lib/myflightbook/crypto.ts).
CREATE TABLE IF NOT EXISTS "external_connection" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "external_connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "external_connection_personId_provider_key"
  ON "external_connection"("personId", "provider");

DO $$ BEGIN
  ALTER TABLE "external_connection" ADD CONSTRAINT "external_connection_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tokens must never be reachable through Supabase's public Data API. Prisma (table owner) bypasses RLS.
ALTER TABLE "external_connection" ENABLE ROW LEVEL SECURITY;
