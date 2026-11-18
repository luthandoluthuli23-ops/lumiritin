import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { COMPANY, HELP_FALLBACK, NOT_AN_OPERATOR, OUR_STORY, SITE_CONTACT } from "../lib/site-contact";

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
    for (const key of ["founderName", "founderBackground", "companyName", "companyRegistration", "cityProvince"]) {
      assert.ok(about.includes(`COMPANY.${key}`), key);
    }
    assert.match(about, /OUR_STORY/);
  });

  it("unset contact details and company facts are clearly marked placeholders, never invented values", () => {
    // Given by the owner on 2026-11-18:
    assert.equal(COMPANY.companyName, "Lumiritin Aviation");
    assert.equal(COMPANY.companyRegistration, "2026/770269/07");
    assert.equal(COMPANY.founderName, "Luthando Luthuli");
    assert.equal(COMPANY.cityProvince, "Pietermaritzburg, KwaZulu-Natal");
    assert.match(OUR_STORY[0], /^Lumiritin began at the aero club in Pietermaritzburg\./);
    assert.equal(OUR_STORY[OUR_STORY.length - 1], "Made by the aviation community, for the aviation community.");
    // Still unknown → still a clearly marked placeholder, never a guess:
    assert.match(COMPANY.informationOfficer, /^\[[A-Z_]+\]$/);
    if (!process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164) {
      assert.equal(SITE_CONTACT.phoneDisplay, "082 839 9906");
      assert.equal(SITE_CONTACT.whatsappUrl, "https://wa.me/27828399906");
      assert.equal(HELP_FALLBACK, "WhatsApp 082 839 9906 for help.");
    }
    if (!process.env.NEXT_PUBLIC_CONTACT_EMAIL) {
      assert.equal(SITE_CONTACT.email, "hello@lumiritin.co.za");
      assert.equal(SITE_CONTACT.emailUrl, "mailto:hello@lumiritin.co.za");
    }
  });
});
