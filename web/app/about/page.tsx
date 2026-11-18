import type { Metadata } from "next";
import Link from "next/link";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { COMPANY, NOT_AN_OPERATOR, OUR_STORY, SITE_CONTACT } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "About — Lumiritin",
  description: "Who is behind Lumiritin, and why it exists.",
};

export default function AboutPage() {
  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="About" title="About Lumiritin" subtitle="Private aviation for South Africa: pilots, operators and passengers on one platform." />

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">Our story</h2>
        {OUR_STORY.map((para, i) => (
          <p key={i} className={i === OUR_STORY.length - 1 ? "font-display text-2xl text-gold-light" : undefined}>
            {para}
          </p>
        ))}
        <p>
          The Lumiritin app takes its name from <span className="text-ivory">{COMPANY.companyName}</span>, the company behind it.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-slate-tac">
        <h2 className="font-display text-3xl text-ivory">What we are, and aren&rsquo;t</h2>
        <p className="text-ivory">{NOT_AN_OPERATOR}</p>
        <p>
          We take the paperwork off pilots, help operators find crew at short notice, and check crew profiles against SACAA
          records. The South African Civil Aviation Authority (SACAA) record is always the authority. See{" "}
          <Link href="/verification" className="underline underline-offset-4 hover:text-ivory">how verification works</Link>.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-ivory">Company details</h2>
        <dl className="mt-6 divide-y divide-white/10 rounded-3xl border border-white/10">
          {[
            ["Founder", `${COMPANY.founderName}, ${COMPANY.founderBackground}`],
            ["Company", COMPANY.companyName],
            ["Registration number", COMPANY.companyRegistration],
            ["Based in", COMPANY.cityProvince],
            ["WhatsApp / phone", SITE_CONTACT.phoneDisplay],
            ["Email", SITE_CONTACT.email],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 p-5 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <dt className="text-slate-tac">{k}</dt>
              <dd className="text-ivory">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
