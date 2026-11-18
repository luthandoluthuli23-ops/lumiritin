// Expiry reminders: 60, 30 and 7 days before a licence, rating, medical (or recurrent check) expires, one reminder on
// every channel the pilot has (WhatsApp + email). Only the tightest threshold that applies is sent: a pilot first seen
// with 20 days left gets the 30-day reminder, then the 7-day one; never all three at once.
//
// Idempotent: each reminder is CLAIMED first by inserting its notification row (unique on item + expiry date +
// threshold), and only the run that wins the insert sends. Two overlapping runs can't double-send. If nothing could
// be delivered (e.g. WhatsApp not configured) the claim is released, so the reminder is retried on the next run
// instead of being silently "used up". A renewal (new expiry date) starts a fresh set of reminders.
// Gated on an active WhatsApp-notifications consent (POPIA). Not "server-only": the CLI job uses it too.
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { CHECK_TYPE_LABEL } from "./checks";
import { sendExpiryReminderEmail } from "./email";
import { whatsappProvider, type WhatsAppProvider } from "./messaging";
import { sendExpiryReminder } from "./whatsapp";

export const REMINDER_THRESHOLDS = [7, 30, 60] as const;
const MAX_DAYS = Math.max(...REMINDER_THRESHOLDS);
const DAY_MS = 86_400_000;

/** The reminder due for an item with `daysLeft` days to go: the tightest threshold it is within, or null. */
export function reminderThreshold(daysLeft: number): (typeof REMINDER_THRESHOLDS)[number] | null {
  if (daysLeft < 0) return null; // already expired: that's a state change (CHECK_OVERDUE), not a reminder
  return REMINDER_THRESHOLDS.find((t) => daysLeft <= t) ?? null;
}

export const startOfDayUtc = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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

async function loadExpiring(client: typeof db, today: Date): Promise<ExpiringItem[]> {
  const window = { gte: today, lte: new Date(today.getTime() + MAX_DAYS * DAY_MS) };
  const consent = { consents: { some: { scope: "whatsapp_notifications", revokedAt: null } } };
  const personSelect = { id: true, fullName: true, whatsappE164: true, email: true };

  const [credentials, ratings, medicals, checks] = await Promise.all([
    client.credential.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
    client.rating.findMany({ where: { expiresAt: window, credential: { person: consent } }, include: { credential: { include: { person: { select: personSelect } } } } }),
    client.medical.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
    client.checkRecord.findMany({ where: { expiresAt: window, person: consent }, include: { person: { select: personSelect } } }),
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
  /** Already sent (or being sent by an overlapping run): skipped, never sent twice. */
  skipped: number;
  /** Claimed but nothing could be delivered; released for the next run. */
  undelivered: number;
  byChannel: { email: number; whatsapp: number };
}

export interface ReminderDeps {
  now?: Date;
  client?: typeof db;
  provider?: WhatsAppProvider;
  sendEmail?: typeof sendExpiryReminderEmail;
}

export async function runExpiryReminders(deps: ReminderDeps = {}): Promise<ReminderRun> {
  const client = deps.client ?? db;
  const provider = deps.provider ?? whatsappProvider();
  const sendEmail = deps.sendEmail ?? sendExpiryReminderEmail;
  const today = startOfDayUtc(deps.now ?? new Date());
  const items = await loadExpiring(client, today);
  const run: ReminderRun = { checked: items.length, sent: 0, skipped: 0, undelivered: 0, byChannel: { email: 0, whatsapp: 0 } };

  for (const item of items) {
    const daysLeft = Math.round((item.expiresAt.getTime() - today.getTime()) / DAY_MS);
    const threshold = reminderThreshold(daysLeft);
    if (threshold === null) continue;

    const key = { itemType: item.itemType, itemId: item.itemId, itemExpiresAt: item.expiresAt, thresholdDays: threshold };
    let claimId: string;
    try {
      claimId = (await client.notification.create({ data: { ...key, personId: item.person.id, channel: "pending" } })).id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        run.skipped++;
        continue;
      }
      throw e;
    }

    const name = item.person.fullName.split(" ")[0] || item.person.fullName;
    const expiresOn = item.expiresAt.toISOString().slice(0, 10);
    const channels: string[] = [];
    if (item.person.whatsappE164 && (await sendExpiryReminder({ toE164: item.person.whatsappE164, name, item: item.label, expiresOn, daysLeft }, provider).catch(() => false))) {
      channels.push("whatsapp");
      run.byChannel.whatsapp++;
    }
    if (item.person.email && (await sendEmail({ to: item.person.email, name, item: item.label, expiresOn, daysLeft }).catch(() => ({ ok: false }))).ok) {
      channels.push("email");
      run.byChannel.email++;
    }

    if (channels.length === 0) {
      await client.notification.delete({ where: { id: claimId } }).catch(() => undefined);
      run.undelivered++;
      continue;
    }
    await client.notification.update({ where: { id: claimId }, data: { channel: channels.join("+") } });
    run.sent++;
  }
  return run;
}
