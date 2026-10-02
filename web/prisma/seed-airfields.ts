// Production-safe seed: loads ONLY the airfield reference data. Run once after `prisma migrate deploy`:
//   npm run db:seed:airfields
import { PrismaClient } from "@prisma/client";
import { seedAirfields } from "./airfields";

const db = new PrismaClient();
seedAirfields(db).finally(() => db.$disconnect());
