-- Profile verification states and an append-only audit log of every check (Task 3). Idempotent; applied by hand
-- (never `prisma migrate dev`: the hosted database's migration history has drifted).
--
--  * person gets a stored base state (UNVERIFIED / VERIFIED / MISMATCH), the date of the last PASS, the latest check's
--    result, and a public code for /verify/[code]. EXPIRING and CHECK_OVERDUE are derived from dates in the app.
--  * verification_check is append-only: a trigger rejects UPDATE, DELETE and TRUNCATE.
--  * Changing a person's fullName or a credential's licenceNumber resets the profile to UNVERIFIED and logs a RESET,
--    enforced here so no code path can skip it.

DO $$ BEGIN CREATE TYPE "VerificationBase" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISMATCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CheckResult" AS ENUM ('PASS', 'MISMATCH', 'FAILED', 'RESET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CheckSource" AS ENUM ('SACAA_PORTAL', 'REVIEWER', 'OTP_RELAY', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "person"
  ADD COLUMN IF NOT EXISTS "verificationBase" "VerificationBase" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "lastPassAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCheckResult" "CheckResult",
  ADD COLUMN IF NOT EXISTS "publicCode" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 12);

CREATE UNIQUE INDEX IF NOT EXISTS "person_publicCode_key" ON "person"("publicCode");

CREATE TABLE IF NOT EXISTS "verification_check" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "credentialId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CheckSource" NOT NULL,
    "result" "CheckResult" NOT NULL,
    "fieldsCompared" JSONB,
    "error" TEXT,
    "reviewer" TEXT,
    "note" TEXT,

    CONSTRAINT "verification_check_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verification_check_personId_checkedAt_idx" ON "verification_check"("personId", "checkedAt");

-- Not reachable through Supabase's public Data API. Prisma (table owner) bypasses RLS.
ALTER TABLE "verification_check" ENABLE ROW LEVEL SECURITY;

-- ── Append-only ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "verification_check_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'verification_check is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS "verification_check_no_update_delete" ON "verification_check";
CREATE TRIGGER "verification_check_no_update_delete"
  BEFORE UPDATE OR DELETE ON "verification_check"
  FOR EACH ROW EXECUTE FUNCTION "verification_check_append_only"();

DROP TRIGGER IF EXISTS "verification_check_no_truncate" ON "verification_check";
CREATE TRIGGER "verification_check_no_truncate"
  BEFORE TRUNCATE ON "verification_check"
  FOR EACH STATEMENT EXECUTE FUNCTION "verification_check_append_only"();

-- ── Identity change resets the profile ──────────────────────────────────────
CREATE OR REPLACE FUNCTION "person_identity_reset"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fullName" IS DISTINCT FROM OLD."fullName" THEN
    NEW."verificationBase" := 'UNVERIFIED';
    INSERT INTO "verification_check" ("id", "personId", "source", "result", "note")
      VALUES (gen_random_uuid()::text, NEW."id", 'SYSTEM', 'RESET', 'Name changed: profile reset to unverified');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "person_identity_reset" ON "person";
CREATE TRIGGER "person_identity_reset"
  BEFORE UPDATE OF "fullName" ON "person"
  FOR EACH ROW EXECUTE FUNCTION "person_identity_reset"();

CREATE OR REPLACE FUNCTION "credential_identity_reset"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."licenceNumber" IS DISTINCT FROM OLD."licenceNumber" THEN
    UPDATE "person" SET "verificationBase" = 'UNVERIFIED' WHERE "id" = NEW."personId";
    INSERT INTO "verification_check" ("id", "personId", "credentialId", "source", "result", "note")
      VALUES (gen_random_uuid()::text, NEW."personId", NEW."id", 'SYSTEM', 'RESET', 'Licence number changed: profile reset to unverified');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "credential_identity_reset" ON "credential";
CREATE TRIGGER "credential_identity_reset"
  AFTER UPDATE OF "licenceNumber" ON "credential"
  FOR EACH ROW EXECUTE FUNCTION "credential_identity_reset"();
