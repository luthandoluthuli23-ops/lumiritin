import "server-only";
import { db } from "@/lib/db";
import type { AirfieldOption } from "@/lib/geo";

/** All airfields, ordered by city, in the shape the browser components expect. */
export async function listAirfields(): Promise<AirfieldOption[]> {
  const rows = await db.airfield.findMany({ orderBy: [{ city: "asc" }, { icao: "asc" }] });
  return rows.map((a) => ({
    icao: a.icao,
    iata: a.iata,
    name: a.name,
    city: a.city,
    lat: a.lat,
    lng: a.lng,
    hangarHub: a.hangarStatus === "HUB",
  }));
}
