-- Pilot-triggered verification (Task 4): consent wording stored with each grant, submissions for a reviewer, and the
-- uploaded licence/medical images (AES-256-GCM ciphertext, see lib/documents.ts). Idempotent; applied by hand.

ALTER TABLE "consent" ADD COLUMN IF NOT EXISTS "text" TEXT;

DO $$ BEGIN CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'DECIDED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReviewDecision" AS ENUM ('VERIFIED', 'MISMATCH', 'UNREADABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DocumentKind" AS ENUM ('LICENCE', 'MEDICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "verification_submission" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "consentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "holderName" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "licenceType" TEXT,
    "licenceExpiresAt" DATE,
    "medicalClass" INTEGER,
    "medicalExpiresAt" DATE,
    "ratings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lumiPrefill" JSONB,
    "decision" "ReviewDecision",
    "decidedAt" TIMESTAMP(3),
    "reviewer" TEXT,
    "reviewerNote" TEXT,
    "documentsPurgedAt" TIMESTAMP(3),

    CONSTRAINT "verification_submission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verification_submission_status_createdAt_idx" ON "verification_submission"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "verification_submission_personId_createdAt_idx" ON "verification_submission"("personId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "verification_submission" ADD CONSTRAINT "verification_submission_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "verification_document" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "verification_document_submissionId_idx" ON "verification_document"("submissionId");

DO $$ BEGIN
  ALTER TABLE "verification_document" ADD CONSTRAINT "verification_document_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "verification_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Identity documents must never be reachable through Supabase's public Data API. Prisma (table owner) bypasses RLS.
ALTER TABLE "verification_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_document" ENABLE ROW LEVEL SECURITY;
