import type { Metadata } from "next";
import { EmptyLegBrowser } from "@/components/empty-legs/EmptyLegBrowser";
import { listOpenEmptyLegs } from "@/lib/empty-legs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Empty Leg Deals — Lumiritin",
  description: "Private jet repositioning flights in South Africa at up to 75% off charter rates.",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Server component: fetches live legs, then hands them to the client browser for instant filtering.
// `?from=&to=&date=` pre-fills the search (the home page search box links here).
export default async function EmptyLegsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [legs, sp] = await Promise.all([listOpenEmptyLegs(), searchParams]);
  const date = first(sp.date);

  return (
    <main>
      <EmptyLegBrowser
        legs={legs}
        initial={{ from: first(sp.from), to: first(sp.to), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "" }}
      />
    </main>
  );
}
