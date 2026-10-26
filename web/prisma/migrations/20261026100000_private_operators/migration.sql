-- Private operators: own aircraft, no AOC.
ALTER TABLE "operator" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
