import { after, NextResponse, type NextRequest } from "next/server";
import { syncStateNotification } from "@/lib/state-notifications";
import { z } from "zod";
import { db } from "@/lib/db";
import { withdrawVerificationConsent } from "@/lib/pilot-verification";
import { getPilotPersonId } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({ scope: z.enum(["sacaa_verification", "whatsapp_notifications"]) });

/**
 * DELETE { scope } — the pilot withdraws a consent (Settings).
 *  - sacaa_verification: revoked, pending reviews stopped and their documents deleted, profile reset to UNVERIFIED.
 *  - whatsapp_notifications: revoked; no more WhatsApp reminders.
 */
export async function DELETE(req: NextRequest) {
  const personId = await getPilotPersonId();
  if (!personId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_failed" }, { status: 422 });

  if (parsed.data.scope === "sacaa_verification") {
    const r = await withdrawVerificationConsent(personId);
    after(() => syncStateNotification(personId).catch((e) => console.error("[consent] state message failed:", e)));
    return NextResponse.json({ ok: true, ...r });
  }
  const r = await db.consent.updateMany({ where: { personId, scope: "whatsapp_notifications", revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true, revoked: r.count });
}
