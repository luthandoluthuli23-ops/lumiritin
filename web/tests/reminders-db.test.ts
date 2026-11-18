// Idempotency of reminders and state-change messages against a real PostgreSQL (migrations applied). Runs only when
// TEST_DATABASE_URL points at a LOCAL throwaway database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";
import type { TemplateMessage, WhatsAppProvider } from "../lib/messaging";

const url = process.env.TEST_DATABASE_URL;
const local = (() => {
  try {
    return url ? ["localhost", "127.0.0.1"].includes(new URL(url).hostname) : false;
  } catch {
    return false;
  }
})();

/** Records every send; delivers unless told not to. */
class FakeProvider implements WhatsAppProvider {
  readonly name = "fake";
  sent: TemplateMessage[] = [];
  constructor(public deliver = true) {}
  async sendTemplate(msg: TemplateMessage) {
    this.sent.push(msg);
    return { delivered: this.deliver };
  }
}
const noEmail = async () => ({ ok: false });

describe("reminders and state messages are never sent twice (database)", { skip: !local && "set TEST_DATABASE_URL to a local throwaway database" }, () => {
  let db: typeof import("../lib/db").db;
  let reminders: typeof import("../lib/reminders");
  let notices: typeof import("../lib/state-notifications");
  let personId: string;
  const DAY = 86_400_000;
  const today = new Date(Date.UTC(2031, 0, 10)); // far future so other test rows never fall in the window
  const mine = (sent: TemplateMessage[], number: string) => sent.filter((m) => m.toE164 === number);

  let number: string;
  before(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("../lib/db"));
    reminders = await import("../lib/reminders");
    notices = await import("../lib/state-notifications");
    const tag = randomUUID().slice(0, 8);
    number = `+2799${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`;
    const p = await db.person.create({
      data: {
        fullName: "Reminder Pilot",
        email: `remind-${tag}@example.test`,
        whatsappE164: number,
        consents: { create: { scope: "whatsapp_notifications", textVersion: "test", text: "test consent" } },
        medicals: { create: { class: 1, expiresAt: new Date(today.getTime() + 25 * DAY) } }, // inside the 30-day window
      },
    });
    personId = p.id;
  });

  it("two runs on the same day send the reminder once", async () => {
    const provider = new FakeProvider();
    const first = await reminders.runExpiryReminders({ now: today, provider, sendEmail: noEmail });
    const second = await reminders.runExpiryReminders({ now: today, provider, sendEmail: noEmail });
    assert.equal(mine(provider.sent, number).length, 1);
    assert.equal(mine(provider.sent, number)[0].params[3], "25");
    assert.ok(first.sent >= 1);
    assert.ok(second.skipped >= 1);
  });

  it("overlapping runs (at the same moment) still send it once", async () => {
    await db.medical.updateMany({ where: { personId }, data: { expiresAt: new Date(today.getTime() + 5 * DAY) } }); // now the 7-day one is due
    const provider = new FakeProvider();
    await Promise.all(Array.from({ length: 5 }, () => reminders.runExpiryReminders({ now: today, provider, sendEmail: noEmail })));
    assert.equal(mine(provider.sent, number).length, 1);
  });

  it("an undelivered reminder is released and retried, then sent exactly once", async () => {
    await db.medical.updateMany({ where: { personId }, data: { expiresAt: new Date(today.getTime() + 50 * DAY) } }); // renewal → 60-day window
    const down = new FakeProvider(false);
    await reminders.runExpiryReminders({ now: today, provider: down, sendEmail: noEmail });
    assert.equal(mine(down.sent, number).length, 1, "attempted");
    const up = new FakeProvider(true);
    await reminders.runExpiryReminders({ now: today, provider: up, sendEmail: noEmail });
    await reminders.runExpiryReminders({ now: today, provider: up, sendEmail: noEmail });
    assert.equal(mine(up.sent, number).length, 1, "retried once, then never again");
  });

  it("a state change is announced once; the first sighting is silent", async () => {
    const provider = new FakeProvider();
    assert.equal(await notices.syncStateNotification(personId, { provider, sendEmail: noEmail }), "baseline");
    assert.equal(await notices.syncStateNotification(personId, { provider, sendEmail: noEmail }), "unchanged");
    assert.equal(provider.sent.length, 0);

    await db.person.update({ where: { id: personId }, data: { verificationBase: "MISMATCH" } });
    const results = await Promise.all(Array.from({ length: 5 }, () => notices.syncStateNotification(personId, { provider, sendEmail: noEmail })));
    assert.equal(results.filter((r) => r === "sent").length, 1);
    assert.equal(provider.sent.length, 1);
    assert.equal(provider.sent[0].template, "verification_state_change");
    assert.equal(provider.sent[0].params[1], "Mismatch");
    assert.equal(await notices.syncStateNotification(personId, { provider, sendEmail: noEmail }), "unchanged");
  });

  it("an undelivered state message is retried later, not lost", async () => {
    await db.person.update({ where: { id: personId }, data: { verificationBase: "UNVERIFIED" } });
    assert.equal(await notices.syncStateNotification(personId, { provider: new FakeProvider(false), sendEmail: noEmail }), "undelivered");
    const up = new FakeProvider();
    assert.equal(await notices.syncStateNotification(personId, { provider: up, sendEmail: noEmail }), "sent");
    assert.equal(up.sent[0].params[1], "Unverified");
  });
});
