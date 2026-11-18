import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { COMPANY, HELP_FALLBACK, NOT_AN_OPERATOR, SITE_CONTACT } from "../lib/site-contact";

const ROOT = join(__dirname, "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("about, contact and footer (Task 2)", () => {
  it("every page the footer links to exists", () => {
    for (const page of ["about", "privacy", "terms", "verification"]) {
      assert.ok(existsSync(join(ROOT, "app", page, "page.tsx")), `/${page}`);
    }
  });

  it("the footer (rendered on every page by the root layout) has phone, email, privacy, terms and verification", () => {
    const footer = src("components/layout/Footer.tsx");
    for (const needle of ['href="/privacy"', 'href="/terms"', 'href="/verification"', "SITE_CONTACT.phoneDisplay", "SITE_CONTACT.email"]) {
      assert.ok(footer.includes(needle), needle);
    }
    assert.match(src("app/layout.tsx"), /<Footer \/>/);
  });

  it("the about page states we're not an air operator and shows every company placeholder", () => {
    assert.equal(NOT_AN_OPERATOR, "Lumiritin is a booking and credentialing platform, not an air operator.");
    const about = src("app/about/page.tsx");
    assert.match(about, /NOT_AN_OPERATOR/);
    for (const key of ["founderName", "founderBackground", "whyStarted", "companyName", "companyRegistration", "cityProvince"]) {
      assert.ok(about.includes(`COMPANY.${key}`), key);
    }
  });

  it("unset contact details and company facts are clearly marked placeholders, never invented values", () => {
    for (const v of Object.values(COMPANY)) assert.match(v, /^\[[A-Z_]+\]$/);
    if (!process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164) {
      assert.equal(SITE_CONTACT.phoneDisplay, "[PHONE]");
      assert.equal(SITE_CONTACT.whatsappUrl, null);
      assert.equal(HELP_FALLBACK, "WhatsApp [PHONE] for help.");
    }
    if (!process.env.NEXT_PUBLIC_CONTACT_EMAIL) {
      assert.equal(SITE_CONTACT.email, "hello@lumiritin.co.za");
      assert.equal(SITE_CONTACT.emailUrl, "mailto:hello@lumiritin.co.za");
    }
  });
});
