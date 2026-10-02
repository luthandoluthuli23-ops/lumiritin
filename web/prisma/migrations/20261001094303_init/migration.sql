-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('PILOT', 'CABIN_CREW', 'AME', 'GROUND_CREW');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PILOT_LICENCE', 'AME_LICENCE', 'CABIN_CREW_CERT', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VERIFIED', 'NOT_FOUND', 'BLOCKED', 'PORTAL_ERROR');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsappE164" TEXT,
    "role" "CrewRole" NOT NULL DEFAULT 'PILOT',
    "homeAirfieldIcao" TEXT,
    "travelRadiusKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL DEFAULT 'PILOT_LICENCE',
    "licenceNumber" TEXT NOT NULL,
    "licenceCategory" TEXT,
    "holderNameOnRecord" TEXT,
    "portalStatus" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerificationResult" "VerificationOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "expiresAt" DATE,
    "source" TEXT NOT NULL DEFAULT 'sacaa',

    CONSTRAINT "rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "class" INTEGER NOT NULL,
    "expiresAt" DATE,
    "source" TEXT NOT NULL DEFAULT 'sacaa',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_summary" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "totalHours" DECIMAL(8,1) NOT NULL,
    "picHours" DECIMAL(8,1),
    "multiEngineHours" DECIMAL(8,1),
    "turbineHours" DECIMAL(8,1),
    "instrumentHours" DECIMAL(8,1),
    "nightHours" DECIMAL(8,1),
    "lastFlightAt" DATE,
    "asOf" DATE NOT NULL,
    "uploadKey" TEXT,
    "selfDeclared" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "logbook_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_log" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "VerificationOutcome" NOT NULL,
    "snapshot" JSONB,
    "changes" JSONB,
    "htmlSha256" TEXT,
    "error" TEXT,

    CONSTRAINT "verification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemExpiresAt" DATE NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aocNumber" TEXT,
    "contactEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "typeDesignator" TEXT NOT NULL,
    "baseIcao" TEXT,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "aircraftId" TEXT,
    "role" "CrewRole" NOT NULL,
    "requiredRatings" TEXT[],
    "minTotalHours" INTEGER,
    "departureIcao" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_email_key" ON "person"("email");

-- CreateIndex
CREATE INDEX "credential_personId_idx" ON "credential"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "credential_type_licenceNumber_key" ON "credential"("type", "licenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rating_credentialId_name_key" ON "rating"("credentialId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "medical_personId_class_key" ON "medical"("personId", "class");

-- CreateIndex
CREATE UNIQUE INDEX "logbook_summary_personId_key" ON "logbook_summary"("personId");

-- CreateIndex
CREATE INDEX "availability_personId_startsAt_idx" ON "availability"("personId", "startsAt");

-- CreateIndex
CREATE INDEX "verification_log_credentialId_ranAt_idx" ON "verification_log"("credentialId", "ranAt");

-- CreateIndex
CREATE INDEX "consent_personId_scope_idx" ON "consent"("personId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "notification_itemType_itemId_itemExpiresAt_thresholdDays_key" ON "notification"("itemType", "itemId", "itemExpiresAt", "thresholdDays");

-- CreateIndex
CREATE UNIQUE INDEX "operator_aocNumber_key" ON "operator"("aocNumber");

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_registration_key" ON "aircraft"("registration");

-- CreateIndex
CREATE INDEX "request_status_startsAt_idx" ON "request"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "credential" ADD CONSTRAINT "credential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical" ADD CONSTRAINT "medical_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_summary" ADD CONSTRAINT "logbook_summary_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_log" ADD CONSTRAINT "verification_log_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request" ADD CONSTRAINT "request_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
