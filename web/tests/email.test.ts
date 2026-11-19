import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildWelcomeEmail, sendEmail, sendWelcomeEmail, siteUrl } from "../lib/email";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
beforeEach(() => {
  delete process.env.APP_BASE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.CHARTER_PUBLIC;
});
afterEach(() => {
  process.env = { ...saved };
  globalThis.fetch = realFetch;
});

describe("siteUrl", () => {
  it("prefers APP_BASE_URL, strips a trailing slash, and joins paths", () => {
    process.env.APP_BASE_URL = "https://lumiritin.vercel.app/";
    assert.equal(siteUrl("/wallet"), "https://lumiritin.vercel.app/wallet");
    assert.equal(siteUrl("charter"), "https://lumiritin.vercel.app/charter");
    assert.equal(siteUrl(), "https://lumiritin.vercel.app/");
  });
  it("falls back to Vercel's production host, then localhost", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "lumiritin.vercel.app";
    assert.equal(siteUrl("/x"), "https://lumiritin.vercel.app/x");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    assert.equal(siteUrl("/x"), "http://localhost:3000/x");
  });
});

describe("welcome email", () => {
  it("is role specific, with a working link on the configured site", () => {
    process.env.APP_BASE_URL = "https://lumiritin.vercel.app";
    const pilot = buildWelcomeEmail({ firstName: "Thandi", role: "PILOT" });
    const op = buildWelcomeEmail({ firstName: "Thandi", role: "OPERATOR" });
    const pax = buildWelcomeEmail({ firstName: "Thandi", role: "PASSENGER" });

    assert.match(pilot.html, /href="https:\/\/lumiritin\.vercel\.app\/wallet"/);
    assert.match(pilot.html, /credential wallet/i);
    assert.match(pilot.html, /logbook/i);
    assert.match(op.html, /href="https:\/\/lumiritin\.vercel\.app\/operator\/dashboard"/);
    assert.match(op.html, /fleet/i);
    // Charter is switched off by default: passengers are sent to empty legs and charter isn't mentioned.
    assert.match(pax.html, /href="https:\/\/lumiritin\.vercel\.app\/empty-legs"/);
    assert.match(pax.html, /empty legs/i);
    assert.ok(!/\/charter|request a charter/i.test(pax.html + pax.text), "no charter while it is switched off");
    process.env.CHARTER_PUBLIC = "true";
    const paxCharter = buildWelcomeEmail({ firstName: "Thandi", role: "PASSENGER" });
    assert.match(paxCharter.html, /href="https:\/\/lumiritin\.vercel\.app\/charter"/);
    assert.match(paxCharter.html, /Request a charter/);
    for (const e of [pilot, op, pax]) {
      assert.equal(e.subject, "Welcome to Lumiritin");
      assert.match(e.html, /Welcome aboard, Thandi\./);
    }
  });

  it("never links to a domain that isn't the configured site", () => {
    process.env.APP_BASE_URL = "https://example.test";
    for (const role of ["PILOT", "OPERATOR", "PASSENGER"] as const) {
      const hrefs = [...buildWelcomeEmail({ firstName: "A", role }).html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(hrefs.length >= 1);
      for (const h of hrefs) assert.ok(h.startsWith("https://example.test/"), h);
    }
  });

  it("escapes the name so a crafted first name can't inject markup", () => {
    const e = buildWelcomeEmail({ firstName: `<img src=x onerror=alert(1)>"&`, role: "PASSENGER" });
    assert.ok(!e.html.includes("<img"));
    assert.match(e.html, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&amp;/);
  });

  it("falls back to 'there' for an empty name and has a plain-text alternative", () => {
    process.env.APP_BASE_URL = "https://lumiritin.vercel.app";
    const e = buildWelcomeEmail({ firstName: "   ", role: "PILOT" });
    assert.match(e.html, /Welcome aboard, there\./);
    assert.match(e.text, /^Welcome aboard, there\./);
    assert.match(e.text, /https:\/\/lumiritin\.vercel\.app\/wallet/);
    assert.ok(!/[<>]/.test(e.text));
  });
});

describe("sending", () => {
  it("is a logged dry run without a key and never calls the network", async () => {
    let called = false;
    globalThis.fetch = (async () => ((called = true), new Response("{}"))) as typeof fetch;
    const r = await sendWelcomeEmail({ to: "a@b.co", firstName: "A", role: "PASSENGER" });
    assert.deepEqual(r, { ok: false, error: "not_configured" });
    assert.equal(called, false);
  });

  it("posts the welcome email to Resend with auth, recipient, html and text, and a timeout", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.APP_BASE_URL = "https://lumiritin.vercel.app";
    let seen: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => ((seen = { url, init }), new Response("{}", { status: 200 }))) as typeof fetch;
    const r = await sendWelcomeEmail({ to: "new@user.co.za", firstName: "Sipho", role: "PILOT" });
    assert.deepEqual(r, { ok: true });
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer re_test_123");
    const body = JSON.parse(String(seen!.init.body));
    assert.deepEqual(body.to, ["new@user.co.za"]);
    assert.equal(body.subject, "Welcome to Lumiritin");
    assert.match(body.html, /Sipho/);
    assert.match(body.text, /Sipho/);
    assert.ok(seen!.init.signal, "has an abort signal so a slow provider can't hang the request");
  });

  it("reports provider errors and network failures without throwing", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })) as typeof fetch;
    const denied = await sendEmail({ to: "a@b.co", subject: "s", html: "<p>x</p>" });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? "", /403.*domain not verified/);

    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const down = await sendEmail({ to: "a@b.co", subject: "s", html: "<p>x</p>" });
    assert.equal(down.ok, false);
    assert.match(down.error ?? "", /fetch failed/);
  });
});

describe("verification emails", () => {
  it("the pilot gets a 'received' email and each reviewer gets a queue link, via Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    process.env.APP_BASE_URL = "https://lumiritin.co.za";
    const sent: { to: string[]; subject: string; html: string }[] = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as typeof fetch;
    const { sendSubmissionReceivedEmail, sendReviewerQueueEmail } = await import("../lib/email");
    assert.equal((await sendSubmissionReceivedEmail({ to: "p@x.co", name: "Thandi" })).ok, true);
    assert.equal((await sendReviewerQueueEmail("r@x.co")).ok, true);
    assert.equal(sent[0].subject, "We've received your documents");
    assert.match(sent[0].html, /Hi Thandi/);
    assert.match(sent[0].html, /https:\/\/lumiritin\.co\.za\/wallet\/verify/);
    assert.match(sent[1].html, /https:\/\/lumiritin\.co\.za\/admin\/review/);
    assert.doesNotMatch(sent[1].html, /Thandi/);
  });

  it("the welcome email no longer claims the AI verifies licences", () => {
    const { html } = buildWelcomeEmail({ firstName: "A", role: "PILOT" });
    assert.doesNotMatch(html, /AI concierge checks/);
    assert.match(html, /reviewer checks them/);
  });

  it("signup gives a new crew profile an UNVERIFIED baseline, so the first approval is emailed", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/api/auth/signup/route.ts", import.meta.url), "utf8");
    assert.match(src, /notifiedState: "UNVERIFIED"/);
  });
});
