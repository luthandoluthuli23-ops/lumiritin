// Feature switches. CHARTER_PUBLIC is exposed to the browser through next.config.mjs (`env`), so it is baked in at
// build time on the server and the client alike: changing it in Vercel needs a redeploy to take effect.

/**
 * Custom charter (/charter, the quote API, and the "Charter" nav item). Off unless CHARTER_PUBLIC=true.
 * While off the routes 404 and nothing links to them; the code stays so it can be switched back on.
 */
export const isCharterEnabled = (): boolean => {
  const v = (process.env.CHARTER_PUBLIC ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
};

/**
 * The major South African airports Lumiritin serves (owner's decision, 2026-11-18). Shown on the homepage with a
 * "Detect yours" button, and the default charter airfields. Every one is in the airfield table.
 */
export const MAJOR_AIRPORTS = ["FAOR", "FACT", "FADN", "FALA", "FAPE", "FAKN"] as const;

/**
 * ICAO codes of the airfields charter is offered from/to. CHARTER_SERVED_AIRFIELDS (comma separated) overrides the
 * default (MAJOR_AIRPORTS). Every other airfield is listed as "Coming soon".
 */
export const servedAirfields = (): string[] => {
  const fromEnv = (process.env.CHARTER_SERVED_AIRFIELDS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{4}$/.test(s));
  return fromEnv.length ? fromEnv : [...MAJOR_AIRPORTS];
};
