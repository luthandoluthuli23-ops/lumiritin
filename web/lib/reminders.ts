// Expiry reminders for pilots: at 90, 30 and 7 days before a licence, rating, medical or recurrent
// check expires, send one reminder on every channel the pilot has (WhatsApp + email). Only the
// tightest threshold that applies is sent, and the notification table's unique key prevents repeats.
// Gated on an active notifications consent (POPIA).
import "server-only";
import { db } from "@/lib/db";
import { CHECK_TYPE_LABEL } from "@/lib/checks";
import { sendExpiryReminderEmail } from "@/lib/email";
import { sendExpiryReminder } from "@/lib/whatsapp";

const THRESHOLDS = [7, 30, 90] as const;
const MAX_DAYS = 90;
const DAY_MS = 86_400_000;

interface Recipient {
  id: string;
  fullName: string;
  whatsappE164: string | null;
  email: string | null;
}
interface ExpiringItem {
  itemType: "credential" | "rating" | "medical" | "check";
  itemId: string;
  label: string;
  expiresAt: Date;
  person: Recipient;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function loadExpiring(today: Date): Promise<ExpiringItem[]> {
  const window = { gte: today, lte: new Date(today.getTime() + MAX_DAYS * DAY_MS) };
  const consent = { consents: { some: { scope: "whatsapp_notifications", revokedAt: null } } };
  const personSelect = { id: true, fullName: true, whatsappE164: true, email: true };

  const [credentials, ratings, medicals, checks] = await Promise.all([
    db.credential.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
    db.rating.findMany({ where: { expiresAt: window, credential: { person: consent } }, include: { credential: { include: { person: { select: personSelect } } } } }),
    db.medical.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
    db.checkRecord.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
  ]);

  return [
    ...credentials.map((c) => ({ itemType: "credential" as const, itemId: c.id, label: `${c.licenceCategory ?? "Licence"} ${c.licenceNumber}`, expiresAt: c.expiresAt!, person: c.person })),
    ...ratings.map((r) => ({ itemType: "rating" as const, itemId: r.id, label: r.name, expiresAt: r.expiresAt!, person: r.credential.person })),
    ...medicals.map((m) => ({ itemType: "medical" as const, itemId: m.id, label: `Class ${m.class} medical`, expiresAt: m.expiresAt!, person: m.person })),
    ...checks.map((ck) => ({ itemType: "check" as const, itemId: ck.id, label: `${CHECK_TYPE_LABEL[ck.checkType] ?? ck.checkType} (${ck.aircraftType})`, expiresAt: ck.expiresAt!, person: ck.person })),
  ];
}

export interface ReminderRun {
  checked: number;
  sent: number;
  byChannel: { email: number; whatsapp: number };
}

/** Finds due items and sends reminders on every available channel. Safe to run repeatedly (deduped). */
export async function runExpiryReminders(): Promise<ReminderRun> {
  const today = startOfTodayUtc();
  const items = await loadExpiring(today);
  let sent = 0;
  let email = 0;
  let whatsapp = 0;

  for (const item of items) {
    const daysLeft = Math.round((item.expiresAt.getTime() - today.getTime()) / DAY_MS);
    const threshold = THRESHOLDS.find((t) => daysLeft <= t);
    if (threshold === undefined) continue;

    const key = { itemType: item.itemType, itemId: item.itemId, itemExpiresAt: item.expiresAt, thresholdDays: threshold };
    const already = await db.notification.findUnique({ where: { itemType_itemId_itemExpiresAt_thresholdDays: key } });
    if (already) continue;

    const name = item.person.fullName.split(" ")[0] || item.person.fullName;
    const expiresOn = item.expiresAt.toISOString().slice(0, 10);
    let delivered = false;

    if (item.person.whatsappE164) {
      const ok = await sendExpiryReminder({ toE164: item.person.whatsappE164, name, item: item.label, expiresOn, daysLeft }).catch(() => false);
      if (ok) {
        delivered = true;
        whatsapp++;
      }
    }
    if (item.person.email) {
      const r = await sendExpiryReminderEmail({ to: item.person.email, name, item: item.label, expiresOn, daysLeft });
      if (r.ok) {
        delivered = true;
        email++;
      }
    }

    // Only record once something actually went out, so nothing is "used up" during a dry run.
    if (!delivered) continue;
    await db.notification.create({ data: { ...key, personId: item.person.id } });
    sent++;
  }

  return { checked: items.length, sent, byChannel: { email, whatsapp } };
}
