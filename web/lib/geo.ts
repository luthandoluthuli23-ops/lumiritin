// Great-circle geometry. Pure and dependency-free: safe in server code, client components and the edge runtime.

export interface Coordinates {
  lat: number;
  lng: number;
}

/** An airfield as sent to the browser (a subset of the Airfield table). */
export interface AirfieldOption extends Coordinates {
  icao: string;
  iata: string | null;
  name: string;
  city: string;
  hangarHub: boolean;
}

export type WithDistance<T> = T & { distanceKm: number };

const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius
export const KM_PER_NM = 1.852;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Haversine great-circle distance in kilometres. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  // min() guards against h creeping just above 1 from floating-point error for near-antipodal points.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const kmToNm = (km: number): number => km / KM_PER_NM;

export const distanceNm = (a: Coordinates, b: Coordinates): number => kmToNm(haversineKm(a, b));

/** Every airfield with its distance from `from`, closest first. Does not mutate the input. */
export function rankByDistance<T extends Coordinates>(from: Coordinates, places: readonly T[]): WithDistance<T>[] {
  return places.map((p) => ({ ...p, distanceKm: haversineKm(from, p) })).sort((x, y) => x.distanceKm - y.distanceKm);
}

export function nearestAirfield<T extends Coordinates>(from: Coordinates, places: readonly T[]): WithDistance<T> | null {
  return rankByDistance(from, places)[0] ?? null;
}

/** "8.4 km" under 100 km, whole kilometres above. */
export const formatKm = (km: number): string => `${km < 100 ? km.toFixed(1) : Math.round(km)} km`;

export const isValidCoordinates = (c: Coordinates): boolean =>
  Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
