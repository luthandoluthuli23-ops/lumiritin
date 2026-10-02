import { Hero } from "@/components/home/Hero";
import { MetricCounters } from "@/components/home/MetricCounters";
import { PortalCtas } from "@/components/home/PortalCtas";
import { SearchTabs } from "@/components/home/SearchTabs";
import { countOpenEmptyLegs } from "@/lib/empty-legs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const activeEmptyLegs = await countOpenEmptyLegs();

  return (
    <main>
      <Hero />

      <section className="relative z-10 -mt-28 px-6">
        <SearchTabs />
      </section>

      <section className="px-6 py-20">
        <MetricCounters activeEmptyLegs={activeEmptyLegs} />
      </section>

      <section className="px-6 pb-28">
        <div className="mx-auto mb-12 max-w-7xl">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">One platform, three journeys</p>
          <h2 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">Choose your way in</h2>
        </div>
        <PortalCtas />
      </section>
    </main>
  );
}
