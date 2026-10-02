// Small lookup of South African airfields used for search suggestions and display.
// Not authoritative: extend as operators add routes. Unknown ICAO codes still work, they just show no city.
export interface Airfield {
  city: string;
  name: string;
}

export const AIRFIELDS: Record<string, Airfield> = {
  FAPM: { city: "Pietermaritzburg", name: "Pietermaritzburg Airport" },
  FALA: { city: "Johannesburg", name: "Lanseria International" },
  FAOR: { city: "Johannesburg", name: "O.R. Tambo International" },
  FAGM: { city: "Johannesburg", name: "Rand Airport" },
  FAWB: { city: "Pretoria", name: "Wonderboom" },
  FACT: { city: "Cape Town", name: "Cape Town International" },
  FADN: { city: "Durban", name: "King Shaka International" },
  FAVG: { city: "Durban", name: "Virginia Airport" },
  FAPE: { city: "Gqeberha", name: "Chief Dawid Stuurman International" },
  FAEL: { city: "East London", name: "East London Airport" },
  FABL: { city: "Bloemfontein", name: "Bloemfontein International" },
  FAGG: { city: "George", name: "George Airport" },
  FAKM: { city: "Kimberley", name: "Kimberley Airport" },
  FAUP: { city: "Upington", name: "Upington International" },
  FAPN: { city: "Sun City", name: "Pilanesberg International" },
  FAHS: { city: "Hoedspruit", name: "Hoedspruit Air Force Base" },
  FAKN: { city: "Mbombela", name: "Kruger Mpumalanga International" },
};

export const ICAO_RE = /^[A-Z]{4}$/;

export const airfieldCity = (icao: string): string => AIRFIELDS[icao]?.city ?? "";

/** "FALA · Johannesburg" or just "FALA" when unknown. */
export const airfieldLabel = (icao: string): string =>
  AIRFIELDS[icao] ? `${icao} · ${AIRFIELDS[icao].city}` : icao;

/** Matches a free-text query against ICAO code, city or airfield name (case-insensitive). Empty query matches all. */
export function matchesAirfield(icao: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const a = AIRFIELDS[icao];
  return (
    icao.toLowerCase().includes(q) ||
    (a !== undefined && (a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))
  );
}
