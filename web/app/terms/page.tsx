import type { Metadata } from "next";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { COMPANY, NOT_AN_OPERATOR } from "@/lib/site-contact";

export const metadata: Metadata = { title: "Terms of use — Lumiritin", robots: { index: false } };

// DRAFT. Only statements that are true of the product are written out; the legal terms ([TERMS_TEXT]) must be written
// or reviewed by someone qualified before launch.
export default function TermsPage() {
  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="Legal" title="Terms of use" subtitle="Draft. To be finalised before launch." />

      <p className="mt-8 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-ivory">[TERMS_TEXT]</p>

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">The basics</h2>
        <p className="text-ivory">{NOT_AN_OPERATOR}</p>
        <p>
          Verification results show what our reviewers compared and when. The SACAA record is always the authority, and a
          Lumiritin badge is not a SACAA approval. Lumiritin is pre-launch: verification results are for testing and must not be
          relied on for operational decisions.
        </p>
        <p>The pilot wallet is free for pilots.</p>
        <p>
          These terms are provided by {COMPANY.companyName} (registration {COMPANY.companyRegistration}).
        </p>
      </section>
    </main>
  );
}
