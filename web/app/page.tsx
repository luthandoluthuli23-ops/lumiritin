import { EmptyLegSearch } from "@/components/home/EmptyLegSearch";
import { Hero } from "@/components/home/Hero";
import { PortalCtas } from "@/components/home/PortalCtas";
import { TrustLine } from "@/components/pilots/PilotHero";

// The homepage as it is live, minus the placeholder metric counters and the public licence-number lookup.
// Pilots and operators each have their own page (/pilots, /operators).
export default function Home() {
  return (
    <main>
      <Hero />

      <section className="relative z-10 -mt-28 px-6">
        <EmptyLegSearch />
      </section>

      <section className="px-6 pb-28 pt-20">
        <div className="mx-auto mb-12 max-w-7xl">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">One platform, three journeys</p>
          <h2 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">Choose your way in</h2>
        </div>
        <PortalCtas />
        <div className="mx-auto mt-10 max-w-7xl">
          <TrustLine />
        </div>
      </section>
    </main>
  );
}
