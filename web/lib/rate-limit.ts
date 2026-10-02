// In-memory sliding-window limiter, per process. Fine for a single server; swap for Redis when scaled out.
import type { NextRequest } from "next/server";

const buckets = new Map<string, number[]>();

/** Records a hit for `key` and returns true if it exceeds `max` hits in the last `windowMs`. */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const limited = recent.length >= max;
  if (!limited) recent.push(now);
  buckets.set(key, recent);
  return limited;
}

export const clientIp = (req: NextRequest): string => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
