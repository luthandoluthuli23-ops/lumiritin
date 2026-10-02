import type { Metadata } from "next";
import Link from "next/link";
import { aircraftClass } from "@/lib/charter";
import { db } from "@/lib/db";
import { formatWindow, formatZar } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";
import { primaryBtn, ghostBtn } from "@/components/ui/Field";
import { StatCards } from "@/components/operator/StatCards";

export const metadata: Metadata = { title: "Operator dashboard — Lumiritin" };

const CLASS_LABEL = Object.fromEntries(
  ["VERY_LIGHT_JET", "LIGHT_JET", "MIDSIZE_JET", "HEAVY_JET", "TURBOPROP"].map((id) => [id, aircraftClass(id)!.label]),
);

export default async function OperatorDashboard() {
  const { operatorId, operatorName } = await requireOperator();
  const now = new Date();

  const [fleet, inquiries, inquiryCount, legs, activeLegs, crewOpen] = await Promise.all([
    db.aircraft.count({ where: { operatorId } }),
    db.charterBooking.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.charterBooking.count({ where: { status: "REQUESTED" } }),
    db.emptyLeg.findMany({
      where: { operatorId, status: "OPEN", departureEnd: { gte: now } },
      orderBy: { departureStart: "asc" },
      take: 5,
      include: { aircraft: { select: { registration: true } }, bookings: { where: { status: { in: ["PENDING", "CONFIRMED"] } }, select: { seats: true } } },
    }),
    db.emptyLeg.count({ where: { operatorId, status: "OPEN", departureEnd: { gte: now } } }),
    db.crewRequest.count({ where: { operatorId, status: "OPEN", endsAt: { gte: now } } }),
  ]);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl text-ivory">Good day, {operatorName}</h1>
          <p className="mt-2 text-slate-tac">Your fleet, marketplace listings and crew needs at a glance.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/operator/empty-legs/new" className={primaryBtn}>Publish empty leg</Link>
          <Link href="/operator/crewing/new" className={ghostBtn}>Post crew request</Link>
        </div>
      </header>

      <StatCards
        stats={[
          { label: "Active fleet", value: fleet, href: "/operator/fleet" },
          { label: "Pending charter inquiries", value: inquiryCount, href: null, note: "open to all operators" },
          { label: "Active empty legs", value: activeLegs, href: "/operator/empty-legs/new" },
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
                      <p className="text-xs text-slate-tac">{b.reference} · {CLASS_LABEL[b.aircraftClass]} · {b.passengers} pax · {route[0]?.date}</p>
                    </div>
                    <span className="whitespace-nowrap text-gold-light">≈ {formatZar(b.estimatedPriceZar)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="glass rounded-3xl p-6">
          <h2 className="font-display text-2xl text-ivory">Your upcoming empty legs</h2>
          {legs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-tac">Nothing published. Turn a ferry flight into revenue.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {legs.map((l) => {
                const left = l.seatsOffered - l.bookings.reduce((s, b) => s + b.seats, 0);
                return (
                  <li key={l.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="text-ivory">{l.originIcao} → {l.destinationIcao} <span className="text-slate-tac">· {l.aircraft.registration}</span></p>
                      <p className="text-xs text-slate-tac">{formatWindow(l.departureStart.toISOString(), l.departureEnd.toISOString())}</p>
                    </div>
                    <span className="whitespace-nowrap text-emerald-status">{left}/{l.seatsOffered} seats</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
