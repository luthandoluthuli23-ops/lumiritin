import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@/lib/email";
import { toE164 } from "@/lib/phone";
import { isRateLimited } from "@/lib/rate-limit";
import { getOperatorContext } from "@/lib/session";
import { sendTestWhatsapp } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ channel: z.enum(["email", "whatsapp"]), target: z.string().trim().min(3).max(200) });

/** POST — send a test notification to a target, to verify channel credentials. Operators only. */
export async function POST(req: NextRequest) {
  const operator = await getOperatorContext();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRateLimited(`test-notif:${operator.operatorId}`, 12, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many test sends. Please wait a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  const { channel, target } = parsed.data;

  if (channel === "email") {
    if (!z.string().email().safeParse(target).success) {
      return NextResponse.json({ error: "bad_target", message: "Enter a valid email address." }, { status: 422 });
    }
    const r = await sendTestEmail(target);
    if (r.ok) return NextResponse.json({ ok: true, message: `Test email sent to ${target}. Check the inbox (and spam).` });
    return NextResponse.json({ ok: false, error: r.error, message: configMessage("email", r.error) }, { status: r.error === "not_configured" ? 400 : 502 });
  }

  const e164 = toE164(target);
  if (!e164) return NextResponse.json({ error: "bad_target", message: "Enter a valid phone number, e.g. +27821234567." }, { status: 422 });
  const r = await sendTestWhatsapp(e164);
  if (r.ok) return NextResponse.json({ ok: true, message: `Test WhatsApp sent to ${e164}. It should arrive within a few seconds.` });
  return NextResponse.json({ ok: false, error: r.error, message: configMessage("whatsapp", r.error) }, { status: r.error === "not_configured" ? 400 : 502 });
}

function configMessage(channel: "email" | "whatsapp", error?: string): string {
  if (error === "not_configured") {
    return channel === "email"
      ? "Email isn't configured yet. Add RESEND_API_KEY in Vercel."
      : "WhatsApp isn't configured yet. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel.";
  }
  return `Send failed${error ? `: ${error}` : ""}.`;
}
