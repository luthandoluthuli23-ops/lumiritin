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
 * ICAO codes of the airfields charter is actually offered from/to (comma separated in CHARTER_SERVED_AIRFIELDS).
 * Every other airfield is listed as "Coming soon". [SERVED_AIRFIELDS]: a business decision, empty until it's made.
 */
export const servedAirfields = (): string[] =>
  (process.env.CHARTER_SERVED_AIRFIELDS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{4}$/.test(s));
