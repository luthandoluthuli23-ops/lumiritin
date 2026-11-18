import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, it } from "node:test";
import { isCharterEnabled, servedAirfields } from "../lib/features";

const ROOT = join(__dirname, "..");
const SCAN = ["app", "components", "lib"].map((d) => join(ROOT, d));

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|css|svg)$/.test(name)) yield p;
  }
}

// Claims the site must never make (Task 1): we are not SACAA, and nothing is "100%" verified.
const BANNED: [RegExp, string][] = [
  [/100\s*%[^"'`\n]{0,40}verif/i, '"100% … verified"'],
  [/sacaa[\s-]*approved/i, '"SACAA-approved"'],
  [/sacaa[\s-]*certified/i, '"SACAA-certified"'],
  [/official\s+sacaa\s+data/i, '"official SACAA data"'],
  [/sacaa[\s-]*verified/i, '"SACAA-verified" (say "checked against SACAA records")'],
  [/verified\s+by\s+sacaa/i, '"verified by SACAA"'],
  [/sacaa[-_\s]*logo/i, "a SACAA logo"],
];

describe("honest copy", () => {
  it("no banned verification claims anywhere in the site's code", () => {
    const hits: string[] = [];
    for (const dir of SCAN) {
      for (const f of files(dir)) {
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .forEach((line, i) => {
            for (const [re, what] of BANNED) if (re.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1} ${what}`);
          });
      }
    }
    assert.deepEqual(hits, []);
  });

  it("no visible 'Loading…' placeholder text (screen-reader-only status text is allowed)", () => {
    const hits: string[] = [];
    for (const dir of SCAN) {
      for (const f of files(dir)) {
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .forEach((line, i) => {
            if (/>\s*Loading(…|\.\.\.)\s*</.test(line) && !/sr-only/.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}`);
          });
      }
    }
    assert.deepEqual(hits, []);
  });

  it("the pilots page leads with the wallet and the exact trust line; the homepage makes no unbacked claims", () => {
    const hero = readFileSync(join(ROOT, "components/pilots/PilotHero.tsx"), "utf8");
    assert.match(hero, /Your licence, medical and logbook/);
    assert.match(hero, /We warn you on WhatsApp before anything expires\. Free for pilots, always\./);
    assert.match(hero, /Every crew profile checked against SACAA records\./);
    assert.match(hero, /href="\/verification"[\s\S]{0,400}Each profile shows the date it was last verified\./);
    assert.match(readFileSync(join(ROOT, "app/pilots/page.tsx"), "utf8"), /<PilotHero \/>/);
    // The homepage: no placeholder counters, no public licence lookup, and the wallet pitch lives on /pilots.
    const home = ["app/page.tsx", "components/home/Hero.tsx", "components/home/EmptyLegSearch.tsx", "components/home/PortalCtas.tsx"]
      .map((f) => readFileSync(join(ROOT, f), "utf8"))
      .join("\n");
    assert.ok(!/MetricCounters|\/api\/verify|Dispatch time/.test(home), "no counters or public lookup on the homepage");
    assert.ok(!/Your licence, medical and logbook in one place/.test(home), "the wallet pitch is only on the pilots page");
    assert.match(home, /href: "\/pilots"/);
    assert.match(home, /href: "\/operators"/);
  });
});

describe("charter switch (CHARTER_PUBLIC)", () => {
  afterEach(() => {
    delete process.env.CHARTER_PUBLIC;
    delete process.env.CHARTER_SERVED_AIRFIELDS;
  });

  it("is off unless explicitly true", () => {
    for (const v of [undefined, "", "false", "0", "no", "TRUEISH"]) {
      if (v === undefined) delete process.env.CHARTER_PUBLIC;
      else process.env.CHARTER_PUBLIC = v;
      assert.equal(isCharterEnabled(), false, String(v));
    }
    for (const v of ["true", "TRUE", " true ", "1"]) {
      process.env.CHARTER_PUBLIC = v;
      assert.equal(isCharterEnabled(), true, v);
    }
  });

  it("served airfields: the six major airports by default; an override takes only well-formed ICAO codes", () => {
    assert.deepEqual(servedAirfields(), ["FAOR", "FACT", "FADN", "FALA", "FAPE", "FAKN"]);
    process.env.CHARTER_SERVED_AIRFIELDS = " fala, FACT ,bad,FA1X,,FAOR";
    assert.deepEqual(servedAirfields(), ["FALA", "FACT", "FAOR"]);
  });
});
