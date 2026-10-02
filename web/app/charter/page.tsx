import type { Metadata } from "next";
import { CharterConfigurator } from "@/components/charter/CharterConfigurator";
import { db } from "@/lib/db";
import { listAirfields } from "@/lib/airfield-db";
import { ICAO_RE } from "@/lib/airfields";
import { sastDate } from "@/lib/empty-legs-shared";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Custom Charter — Lumiritin",
  description: "Configure a private jet charter and get an instant estimate in rand.",
};
export const dynamic = "force-dynamic";

/** Resolves free-text from the home page search ("FACT", "cape town") to an airfield ICAO, or "". */
function resolveAirfield(q: string | undefined, airfields: { icao: string; iata: string | null; city: string }[]): string {
  const s = (q ?? "").trim().toLowerCase();
  if (!s) return "";
  const hit = airfields.find((a) => a.icao.toLowerCase() === s || a.iata?.toLowerCase() === s || a.city.toLowerCase() === s);
  return hit && ICAO_RE.test(hit.icao) ? hit.icao : "";
}

export default async function CharterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [airfields, session, sp] = await Promise.all([listAirfields(), getSession(), searchParams]);
  const user = session ? await db.user.findUnique({ where: { id: session.sub }, select: { firstName: true, lastName: true, email: true, phone: true, homeAirfieldIcao: true } }) : null;

  const today = sastDate(new Date().toISOString());
  const pax = Number(sp.pax);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! >= today ? sp.date! : "";

  return (
    <main className="px-6 pb-24 pt-32">
      <header className="mx-auto mb-12 max-w-7xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">On-demand charter</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight text-ivory sm:text-6xl">
          Your aircraft, <span className="text-gold-gradient">on your terms.</span>
        </h1>
        <p className="mt-4 max-w-xl text-slate-tac">Build your trip, pick a class of aircraft and see an instant estimate. Operators then confirm a firm price.</p>
      </header>
      <CharterConfigurator
        airfields={airfields}
        today={today}
        initial={{
          from: resolveAirfield(sp.from, airfields) || user?.homeAirfieldIcao || "",
          to: resolveAirfield(sp.to, airfields),
          date,
          pax: Number.isInteger(pax) && pax >= 1 && pax <= 12 ? pax : 2,
        }}
        contact={{ name: user ? `${user.firstName} ${user.lastName}` : "", email: user?.email ?? "", phone: user?.phone ?? "" }}
      />
    </main>
  );
}
