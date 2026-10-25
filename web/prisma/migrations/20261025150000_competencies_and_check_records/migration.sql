-- Rename proficiencies -> competencies, and add recurrent check records.
ALTER TABLE "person" RENAME COLUMN "proficiencies" TO "competencies";

CREATE TABLE "check_record" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "checkType" TEXT NOT NULL,
  "aircraftType" TEXT NOT NULL,
  "completedAt" DATE NOT NULL,
  "examiner" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_record_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "check_record_personId_idx" ON "check_record"("personId");
ALTER TABLE "check_record" ADD CONSTRAINT "check_record_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
