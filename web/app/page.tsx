import Link from "next/link";
import { Hero } from "@/components/home/Hero";
import { NearestAirport } from "@/components/home/NearestAirport";
import { listAirfields } from "@/lib/airfield-db";
import { MAJOR_AIRPORTS } from "@/lib/features";

export const dynamic = "force-dynamic";

// Pilot-first homepage: the free wallet and logbook. Charter, empty legs and operator tools keep their routes but are
// not promoted here. Everything below is a description of features that exist today, nothing more.
const FEATURES = [
  {
    title: "Licence, ratings and medical",
    body: "Keep your SACAA licence, type ratings and medical certificate together, with their expiry dates in one view.",
  },
  {
    title: "Warnings before anything expires",
    body: "A WhatsApp message 60, 30 and 7 days before a licence, rating or medical runs out, so a renewal never sneaks up on you.",
  },
  {
    title: "Your logbook, your data",
    body: "Add flights by hand, import a CSV, scan a logbook page, or connect MyFlightbook. Export the whole logbook as a CSV whenever you like.",
  },
];

const STEPS = [
  { n: "1", title: "Create your wallet", body: "Sign up as a pilot with your name, email and licence number. It's free." },
  { n: "2", title: "Add your documents", body: "Upload photos of your licence and medical so we can check them against SACAA records." },
  { n: "3", title: "Stay current", body: "See every expiry date at a glance and get a WhatsApp warning before each one." },
];

export default async function Home() {
  const airfields = await listAirfields();
  const majors = MAJOR_AIRPORTS.map((icao) => airfields.find((a) => a.icao === icao)).filter((a) => a !== undefined);

  return (
    <main>
      <Hero />

      <section aria-labelledby="features" className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 id="features" className="font-display text-4xl text-ivory sm:text-5xl">Built for pilots</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="glass rounded-3xl p-6 sm:p-8">
                <h3 className="font-display text-2xl text-gold-light">{f.title}</h3>
                <p className="mt-3 text-slate-tac">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="airports" className="px-6 pb-16">
        <div className="mx-auto max-w-7xl">
          <h2 id="airports" className="font-display text-4xl text-ivory sm:text-5xl">Flying work near your airfield</h2>
          <p className="mt-3 max-w-2xl text-slate-tac">
            Pick up quick flights around your main job. Operators post crew requests, and the pilots closest to the departure
            airfield hear first. We serve South Africa&apos;s major airports:
          </p>
          <div className="mt-8">
            <NearestAirport majors={majors} airfields={airfields} />
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          <h2 id="how" className="font-display text-4xl text-ivory sm:text-5xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-3xl border border-white/10 p-6 sm:p-8">
                <p className="font-display text-4xl text-gold">{s.n}</p>
                <h3 className="mt-2 text-lg font-semibold text-ivory">{s.title}</h3>
                <p className="mt-2 text-slate-tac">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/auth/signup?role=pilot" className="inline-flex min-h-11 items-center rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
              Create your free wallet
            </Link>
            <Link href="/verification" className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-ivory transition hover:border-gold/60">
              How verification works
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
