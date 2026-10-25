import type { Metadata } from "next";
import Link from "next/link";
import { aircraftClass } from "@/lib/charter";
import { db } from "@/lib/db";
import { formatZar } from "@/lib/empty-legs-shared";
import { operatorRoster } from "@/lib/insights";
import { requireOperator } from "@/lib/session";
import { primaryBtn } from "@/components/ui/Field";
import { StatCards } from "@/components/operator/StatCards";
import { ReputationMini } from "@/components/insights/Reputation";

export const metadata: Metadata = { title: "Operator dashboard — Lumiritin" };

const CLASS_LABEL: Record<string, string> = Object.fromEntries(
  ["LIGHT_HELI", "MEDIUM_HELI", "HEAVY_HELI"].map((id) => [id, aircraftClass(id)!.label]),
);

export default async function OperatorDashboard() {
  const { operatorId, operatorName } = await requireOperator();
  const now = new Date();

  const [fleet, inquiries, inquiryCount, rosterCount, crewOpen, roster] = await Promise.all([
    db.aircraft.count({ where: { operatorId } }),
    db.charterBooking.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.charterBooking.count({ where: { status: "REQUESTED" } }),
    db.crewRoster.count({ where: { operatorId } }),
    db.crewRequest.count({ where: { operatorId, status: "OPEN", endsAt: { gte: now } } }),
    operatorRoster(operatorId),
  ]);
  const topCrew = roster.slice(0, 3);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl text-ivory">Good day, {operatorName}</h1>
          <p className="mt-2 text-slate-tac">Your fleet, crew and charter demand at a glance.</p>
        </div>
        <Link href="/operator/crewing/new" className={primaryBtn}>Post crew request</Link>
      </header>

      <StatCards
        stats={[
          { label: "Active fleet", value: fleet, href: "/operator/fleet" },
          { label: "Pending charter inquiries", value: inquiryCount, href: null, note: "open to all operators" },
          { label: "Pilots on roster", value: rosterCount, href: "/operator/pilots" },
          { label: "Open crew requests", value: crewOpen, href: "/operator/crewing" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-3xl p-6">
          <h2 className="font-display text-2xl text-ivory">Latest charter inquiries</h2>
          {inquiries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-tac">No open inquiries right now.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {inquiries.map((b) => {
                const route = b.legs as { fromIcao: string; toIcao: string; date: string }[];
                return (
                  <li key={b.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="text-ivory">{route.map((l) => `${l.fromIcao}→${l.toIcao}`).join(" · ")}</p>
                      <p className="text-xs text-slate-tac">{b.reference} · {CLASS_LABEL[b.aircraftClass] ?? b.aircraftClass} · {b.passengers} pax · {route[0]?.date}</p>
                    </div>
                    <span className="whitespace-nowrap text-gold-light">≈ {formatZar(b.estimatedPriceZar)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="glass rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-ivory">Your top crew</h2>
            <Link href="/operator/insights" className="text-sm text-gold-light underline underline-offset-4">Insights →</Link>
          </div>
          {topCrew.length === 0 ? (
            <p className="mt-4 text-sm text-slate-tac">
              List your pilots to see their reliability and rank them. <Link href="/operator/pilots" className="text-gold-light underline">Add crew →</Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {topCrew.map((p) => (
                <li key={p.personId} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="text-ivory">{p.fullName}</span>
                  <ReputationMini reputation={p.reputation} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
