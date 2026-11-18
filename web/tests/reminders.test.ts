import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConsoleProvider, MetaCloudProvider } from "../lib/messaging";
import { REMINDER_THRESHOLDS, reminderThreshold } from "../lib/reminders";
import { sendExpiryReminder, sendStateChange } from "../lib/whatsapp";

describe("reminder thresholds (60, 30, 7 days)", () => {
  it("are exactly 60, 30 and 7", () => assert.deepEqual([...REMINDER_THRESHOLDS].sort((a, b) => b - a), [60, 30, 7]));

  it("sends only the tightest threshold that applies", () => {
    const cases: [number, number | null][] = [
      [90, null], [61, null], [60, 60], [45, 60], [31, 60], [30, 30], [20, 30], [8, 30], [7, 7], [1, 7], [0, 7], [-1, null],
    ];
    for (const [days, expected] of cases) assert.equal(reminderThreshold(days), expected, `${days} days`);
  });
});

describe("WhatsApp provider", () => {
  it("the console provider logs but never reports delivery (dry runs are never recorded as sent)", async () => {
    const p = new ConsoleProvider();
    assert.equal(await sendExpiryReminder({ toE164: "+27820000000", name: "T", item: "Class 1 medical", expiresOn: "2027-01-01", daysLeft: 30 }, p), false);
    assert.equal(p.sent.length, 1);
    assert.deepEqual(p.sent[0].params, ["T", "Class 1 medical", "2027-01-01", "30"]);
  });

  it("Meta Cloud: sends an approved template with ordered body parameters", async () => {
    let seen: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization };
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const p = new MetaCloudProvider("tok", "12345", fake);
    assert.equal(await sendStateChange({ toE164: "+27821234567", name: "Thandi", state: "Verified", detail: "Verified against SACAA records on 10 Nov 2026" }, p), true);
    assert.equal(seen!.url, "https://graph.facebook.com/v21.0/12345/messages");
    assert.equal(seen!.auth, "Bearer tok");
    const t = seen!.body.template as { name: string; components: { parameters: { text: string }[] }[] };
    assert.equal(seen!.body.to, "27821234567");
    assert.equal(t.name, "verification_state_change");
    assert.deepEqual(t.components[0].parameters.map((x) => x.text), ["Thandi", "Verified", "Verified against SACAA records on 10 Nov 2026"]);
  });

  it("Meta Cloud: a rejected or failed send is reported as not delivered, never thrown", async () => {
    const rejected = new MetaCloudProvider("t", "1", (async () => new Response("template not approved", { status: 400 })) as typeof fetch);
    assert.deepEqual(await rejected.sendTemplate({ toE164: "+27", template: "x", params: [] }), { delivered: false, error: "HTTP 400: template not approved" });
    const down = new MetaCloudProvider("t", "1", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    assert.equal((await down.sendTemplate({ toE164: "+27", template: "x", params: [] })).delivered, false);
  });
});
