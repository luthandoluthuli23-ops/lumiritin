import type { Metadata } from "next";
import Link from "next/link";
import { TrustLine } from "@/components/pilots/PilotHero";

export const metadata: Metadata = {
  title: "For operators — Lumiritin",
  description: "Manage your fleet and pilots, post crew requests and see how your crewing performs. For AOC holders and private operators.",
};

// The operator page. Everything here describes the operator portal as it works today (app/operator/*), nothing more.
const FEATURES = [
  { title: "Overview", body: "Your fleet, crew and requests on one dashboard, the moment you sign in." },
  { title: "Crew roster", body: "Your own pilots and cabin crew in one roster: see each one's live reputation and availability, and dispatch them first for your own flights." },
  { title: "Crew requests in minutes", body: "Describe the flight and the role. Qualified, available crew are ranked with transparent scoring and the top three are pinged, with 10 minutes each to accept." },
  { title: "Insights", body: "Your own statistics: how your crewing performs, and how your pilots rank." },
  { title: "Fleet and empty legs", body: "Register your aircraft, and turn repositioning flights into seats passengers can book." },
  { title: "Bench", body: "Offer idle pilots to other operators and accrue a share when they fly a contract job." },
];

const btn = "inline-flex min-h-11 items-center rounded-full px-7 py-3.5 text-sm font-semibold transition";

export default function OperatorsPage() {
  return (
    <main>
      <section className="px-6 pb-16 pt-32 sm:pt-40">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">For operators</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.04] text-ivory sm:text-7xl">
            The right crew, <span className="text-gold-gradient">when the flight is on.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-slate-tac">
            Manage your pilots, see how your crewing performs, and fill a seat in the cockpit in minutes, from one place.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/auth/signup?role=operator" className={`${btn} bg-gold text-obsidian hover:bg-gold-light`}>Create an operator account</Link>
            <Link href="/auth/signin" className={`${btn} border border-white/20 text-ivory hover:border-gold/60`}>Sign in</Link>
          </div>
          <TrustLine className="mt-10" />
        </div>
      </section>

      <section aria-labelledby="op-features" className="px-6 pb-16">
        <div className="mx-auto max-w-7xl">
          <h2 id="op-features" className="font-display text-4xl text-ivory sm:text-5xl">What you get</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="glass rounded-3xl p-6 sm:p-8">
                <h3 className="font-display text-2xl text-gold-light">{f.title}</h3>
                <p className="mt-3 text-slate-tac">{f.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-tac">
            Crew searches only return pilots whose profiles are currently verified against SACAA records (or verified with a credential expiring soon).{" "}
            <Link href="/verification" className="underline underline-offset-4 hover:text-ivory">How verification works</Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="private" className="px-6 pb-24">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-gold">AOC holders</p>
            <h2 className="mt-3 font-display text-3xl text-ivory">Charter and commercial operators</h2>
            <p className="mt-3 text-slate-tac">Sign up with your company name, base and Air Operator Certificate number, then add your fleet and crew.</p>
            <Link href="/auth/signup?role=operator" className={`${btn} mt-6 bg-gold text-obsidian hover:bg-gold-light`}>Get started</Link>
          </div>
          <div id="private-operators" className="rounded-3xl border border-gold/30 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-gold">Private operators</p>
            <h2 className="mt-3 font-display text-3xl text-ivory">Your own aircraft, no AOC</h2>
            <p className="mt-3 text-slate-tac">
              Own or manage an aircraft privately? Sign up as a private operator: no AOC number needed. Create your own operator profile, keep your
              aircraft and your own pilots on it, and track your own statistics in Insights. When you need crew, the same request tools are yours.
            </p>
            <Link href="/auth/signup?role=operator" className={`${btn} mt-6 border border-white/20 text-ivory hover:border-gold/60`}>Sign up as a private operator</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
