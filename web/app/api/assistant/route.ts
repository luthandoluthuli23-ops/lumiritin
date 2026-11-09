import { NextResponse, type NextRequest } from "next/server";
import { isAssistantConfigured, runAssistant } from "@/lib/assistant";
import { sanitizeHistory } from "@/lib/assistant-core";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_CHARS = 20_000;

/** No Origin header (curl, same-origin GET-style fetches in old browsers) is allowed; a different or malformed one is not. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * POST { messages: [{ role: "user" | "assistant", content }] } → { reply, action: { href, label } | null }.
 * Public (visitors ask before they sign up), so it is same-origin only and rate limited per visitor and globally to
 * keep the API bill bounded. It reads the session only to know the visitor's role; it never writes anything.
 */
export async function POST(req: NextRequest) {
  if (!isAssistantConfigured()) {
    return NextResponse.json({ error: "not_configured", message: "The assistant isn't switched on yet." }, { status: 503 });
  }

  // Browsers always send Origin on cross-site POSTs. Refuse other sites using our endpoint (and our credits).
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden", message: "Not allowed." }, { status: 403 });
  }

  const ip = clientIp(req);
  if (isRateLimited(`assistant:ip:${ip}`, 20, 10 * 60_000) || isRateLimited(`assistant:ip-day:${ip}`, 150, 24 * 60 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "You're sending messages quickly. Please wait a few minutes and try again." }, { status: 429 });
  }
  if (isRateLimited("assistant:global", 600, 60 * 60_000)) {
    return NextResponse.json({ error: "busy", message: "Lumi is very busy right now. Please try again in a little while." }, { status: 429 });
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: "too_large", message: "That message is too long." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Send a message." }, { status: 400 });
  }

  const history = sanitizeHistory((body as { messages?: unknown } | null)?.messages);
  if (!history) return NextResponse.json({ error: "bad_request", message: "Send a message." }, { status: 400 });

  const session = await getSession();
  const result = await runAssistant(history, session?.role ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: "Lumi is temporarily unavailable. Please try again shortly." }, { status: 502 });
  }
  return NextResponse.json({ reply: result.reply, action: result.action });
}
