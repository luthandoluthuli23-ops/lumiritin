// Feature switches. NEXT_PUBLIC_* values are baked in at build time (server and browser alike), so changing one in
// Vercel needs a redeploy to take effect.

/**
 * Custom charter requests (/charter, the quote API, and every link, tab and button that leads there).
 * Hidden unless NEXT_PUBLIC_CHARTER_ENABLED=1. While hidden, passengers are pointed at empty legs instead.
 */
export const isCharterEnabled = (): boolean => process.env.NEXT_PUBLIC_CHARTER_ENABLED === "1";
