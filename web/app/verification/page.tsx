import type { Metadata } from "next";
import Link from "next/link";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { HELP_FALLBACK } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "How verification works — Lumiritin",
  description: "What we check on a crew profile, against what, how often, and what each verification state means.",
};

const STATES: { name: string; meaning: string }[] = [
  { name: "Verified", meaning: "A reviewer checked the profile against the pilot's SACAA documents within the last 30 days and everything matched." },
  { name: "Expiring", meaning: "Verified, but a licence, rating or medical runs out within 60 days." },
  { name: "Check overdue", meaning: "The last successful check is more than 30 days old, or the most recent check could not be completed." },
  { name: "Mismatch", meaning: "The details on the profile did not match the documents. The pilot needs to correct them and check again." },
  { name: "Unverified", meaning: "Not checked yet, consent was withdrawn, or the name or licence number changed since the last check." },
];

export default function VerificationPage() {
  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="Verification" title="How verification works" subtitle="What we check, against what, and what each state on a profile means." />

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">What we check</h2>
        <p>
          Every crew profile is checked against SACAA records: the licence and medical certificate issued to the pilot by the South
          African Civil Aviation Authority. We compare the name, licence number, licence type, ratings and expiry dates on the profile
          with those documents.
        </p>
        <p>
          Checks are started by the pilot. SACAA&rsquo;s personnel licensing portal sends a one-time PIN to the licence holder&rsquo;s
          phone, so we cannot look a licence up silently in the background. Instead the pilot gives consent, uploads photos of their
          licence and medical certificate, and a Lumiritin reviewer compares them with the profile.
        </p>
        <p>
          Each profile shows the date it was last verified, for example &ldquo;Verified against SACAA records on 10 Nov 2026&rdquo;. The
          SACAA record is always the authority; our badge is a convenience, not a SACAA approval.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-3xl text-ivory">What the states mean</h2>
        <dl className="mt-6 divide-y divide-white/10 rounded-3xl border border-white/10">
          {STATES.map((s) => (
            <div key={s.name} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="font-semibold text-ivory">{s.name}</dt>
              <dd className="text-slate-tac">{s.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">What never counts as a pass</h2>
        <p>
          A check that fails, times out or is blocked is recorded as a failure, never as a pass. Every check is kept in an audit log
          that is only ever added to: earlier results are never changed or deleted.
        </p>
        <p>
          If a pilot changes the name or licence number on their profile, it goes back to Unverified until it is checked again.
          Operators searching for crew only see Verified and Expiring profiles.
        </p>
      </section>

      <section className="mt-12 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">Your documents</h2>
        <p>
          Uploaded licence and medical photos are encrypted, can only be opened by Lumiritin reviewers, and are deleted 90 days after a
          decision. The result and the audit log are kept. You can withdraw consent at any time in your wallet settings; your profile
          then becomes Unverified.
        </p>
      </section>

      <p className="mt-12 text-sm text-slate-tac">
        Questions? {HELP_FALLBACK} You can also read our <Link href="/privacy" className="underline underline-offset-4 hover:text-ivory">privacy policy</Link>.
      </p>
    </main>
  );
}
