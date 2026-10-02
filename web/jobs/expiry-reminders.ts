/**
 * Daily: WhatsApp reminders at 90, 30 and 7 days before a licence, rating or medical expires.
 * Sends only the tightest threshold that applies (someone at 5 days gets the 7-day reminder,
 * not all three), and the notification table's unique key prevents repeats.
 */
import { db } from "../lib/db";
import { sendExpiryReminder } from "../lib/whatsapp";

const THRESHOLDS = [7, 30, 90] as const;
const MAX_DAYS = Math.max(...THRESHOLDS);
const DAY_MS = 86_400_000;

interface ExpiringItem {
  itemType: "credential" | "rating" | "medical";
  itemId: string;
  label: string;
  expiresAt: Date;
  person: { id: string; fullName: string; whatsappE164: string | null };
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function loadExpiring(today: Date): Promise<ExpiringItem[]> {
  const horizon = new Date(today.getTime() + MAX_DAYS * DAY_MS);
  const window = { gte: today, lte: horizon };
  const whatsappConsent = { consents: { some: { scope: "whatsapp_notifications", revokedAt: null } } };
  const personSelect = { id: true, fullName: true, whatsappE164: true };

  const [credentials, ratings, medicals] = await Promise.all([
    db.credential.findMany({
      where: { expiresAt: window, person: whatsappConsent },
      include: { person: { select: personSelect } },
    }),
    db.rating.findMany({
      where: { expiresAt: window, credential: { person: whatsappConsent } },
      include: { credential: { include: { person: { select: personSelect } } } },
    }),
    db.medical.findMany({
      where: { expiresAt: window, person: whatsappConsent },
      include: { person: { select: personSelect } },
    }),
  ]);

  return [
    ...credentials.map((c) => ({
      itemType: "credential" as const,
      itemId: c.id,
      label: `${c.licenceCategory ?? "Licence"} ${c.licenceNumber}`,
      expiresAt: c.expiresAt!,
      person: c.person,
    })),
    ...ratings.map((r) => ({
      itemType: "rating" as const,
      itemId: r.id,
      label: r.name,
      expiresAt: r.expiresAt!,
      person: r.credential.person,
    })),
    ...medicals.map((m) => ({
      itemType: "medical" as const,
      itemId: m.id,
      label: `Class ${m.class} medical`,
      expiresAt: m.expiresAt!,
      person: m.person,
    })),
  ];
}

async function main() {
  const today = startOfTodayUtc();
  const items = await loadExpiring(today);
  let sent = 0;

  for (const item of items) {
    if (!item.person.whatsappE164) continue;
    const daysLeft = Math.round((item.expiresAt.getTime() - today.getTime()) / DAY_MS);
    const threshold = THRESHOLDS.find((t) => daysLeft <= t);
    if (threshold === undefined) continue;

    const key = {
      itemType: item.itemType,
      itemId: item.itemId,
      itemExpiresAt: item.expiresAt,
      thresholdDays: threshold,
    };
    const already = await db.notification.findUnique({
      where: { itemType_itemId_itemExpiresAt_thresholdDays: key },
    });
    if (already) continue;

    const delivered = await sendExpiryReminder({
      toE164: item.person.whatsappE164,
      name: item.person.fullName.split(" ")[0],
      item: item.label,
      expiresOn: item.expiresAt.toISOString().slice(0, 10),
      daysLeft,
    });
    if (!delivered) continue;
    await db.notification.create({ data: { ...key, personId: item.person.id } });
    sent++;
  }

  console.log(`Checked ${items.length} expiring item(s), sent ${sent} reminder(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
