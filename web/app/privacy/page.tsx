import type { Metadata } from "next";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { COMPANY, SITE_CONTACT } from "@/lib/site-contact";

export const metadata: Metadata = { title: "Privacy policy — Lumiritin", robots: { index: false } };

// DRAFT. The lists below describe what the code actually stores and which services it uses. The legal wording
// ([PRIVACY_POLICY_TEXT]) must be written or reviewed by someone qualified in POPIA before launch.
const WHAT_WE_STORE = [
  "Account details: your name, email address, phone or WhatsApp number, and a scrambled (hashed) password.",
  "Pilot profile: licence number and type, ratings, medical class and expiry dates, home airfield, travel radius and availability.",
  "Logbook: the flights you add, import or connect (for example from MyFlightbook), and their totals.",
  "Verification: photos of your licence and medical certificate (encrypted, deleted 90 days after a decision), and an audit log of every check and its result.",
  "Consent records: what you agreed to, which version of the wording, and when (and when you withdrew it).",
  "Messages we send you: which expiry and status reminders went out, and when.",
];

const SERVICES = [
  "Vercel (hosting the website)",
  "Supabase (database)",
  "Anthropic (the Lumi assistant and reading uploaded documents)",
  "Resend (email)",
  "Meta WhatsApp Business (WhatsApp reminders, only with your consent)",
  "MyFlightbook (only if you choose to connect your logbook)",
];

export default function PrivacyPage() {
  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="Legal" title="Privacy policy" subtitle="Draft. To be finalised before launch." />

      <p className="mt-8 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-ivory">[PRIVACY_POLICY_TEXT]</p>

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">Who is responsible</h2>
        <p>
          {COMPANY.companyName} (registration {COMPANY.companyRegistration}), {COMPANY.cityProvince}. Information Officer:{" "}
          {COMPANY.informationOfficer}.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-ivory">What we store</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-tac">
          {WHAT_WE_STORE.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-ivory">Services we use</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-tac">
          {SERVICES.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">Your choices</h2>
        <p>
          You can withdraw consent to verification or WhatsApp messages at any time in your wallet settings, and export your whole
          logbook as a CSV whenever you like. To ask for a copy of your data, a correction or deletion, contact us on WhatsApp{" "}
          {SITE_CONTACT.phoneDisplay} or by email at {SITE_CONTACT.email}.
        </p>
      </section>
    </main>
  );
}
