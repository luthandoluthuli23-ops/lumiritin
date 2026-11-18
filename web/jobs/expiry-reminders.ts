/**
 * Daily (same as the /api/cron/expiry-reminders route): reminders 60, 30 and 7 days before a licence, rating or
 * medical expires, then a message to every pilot whose verification state changed. Both are idempotent, so running
 * this twice, or alongside the cron, never sends anything twice. Logic lives in lib/reminders.ts and
 * lib/state-notifications.ts; this is just the command-line entry point (npm run job:reminders).
 */
import { db } from "../lib/db";
import { runExpiryReminders } from "../lib/reminders";
import { runStateNotifications } from "../lib/state-notifications";

async function main() {
  const reminders = await runExpiryReminders();
  console.log(`Reminders: checked ${reminders.checked}, sent ${reminders.sent}, already sent ${reminders.skipped}, undelivered ${reminders.undelivered}`, reminders.byChannel);
  const states = await runStateNotifications();
  console.log("State messages:", states);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
