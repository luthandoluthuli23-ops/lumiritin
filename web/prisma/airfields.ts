// Real airfield reference data. Safe to run against any database (idempotent upserts).
// The app needs these rows for sign-up (home/base airfield), charter quotes and crew requests.
import type { HangarStatus, PrismaClient } from "@prisma/client";

export const AIRFIELDS: {
  icao: string;
  iata: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  hangarStatus: HangarStatus;
}[] = [
  { icao: "FAPM", iata: "PZB", name: "Pietermaritzburg Airport", city: "Pietermaritzburg", lat: -29.6288, lng: 30.3986, hangarStatus: "UNKNOWN" },
  { icao: "FALA", iata: "HLA", name: "Lanseria International Airport", city: "Johannesburg", lat: -25.9385, lng: 27.9261, hangarStatus: "HUB" },
  { icao: "FACT", iata: "CPT", name: "Cape Town International Airport", city: "Cape Town", lat: -33.9715, lng: 18.6021, hangarStatus: "HUB" },
  { icao: "FAOR", iata: "JNB", name: "O.R. Tambo International Airport", city: "Johannesburg", lat: -26.1392, lng: 28.246, hangarStatus: "UNKNOWN" },
  { icao: "FADN", iata: "DUR", name: "King Shaka International Airport", city: "Durban", lat: -29.6144, lng: 31.1197, hangarStatus: "UNKNOWN" },
  { icao: "FAKN", iata: "MQP", name: "Kruger Mpumalanga International Airport", city: "Mbombela", lat: -25.3832, lng: 31.1055, hangarStatus: "UNKNOWN" },
  { icao: "FAPE", iata: "PLZ", name: "Chief Dawid Stuurman International Airport", city: "Gqeberha", lat: -33.9849, lng: 25.6173, hangarStatus: "UNKNOWN" },
];

export async function seedAirfields(db: PrismaClient): Promise<void> {
  for (const a of AIRFIELDS) {
    await db.airfield.upsert({ where: { icao: a.icao }, update: a, create: a });
  }
  console.log(`Seeded ${AIRFIELDS.length} airfields`);
}
