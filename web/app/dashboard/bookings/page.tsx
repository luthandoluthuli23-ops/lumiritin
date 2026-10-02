import type { Metadata } from "next";
import Link from "next/link";
import { aircraftClass } from "@/lib/charter";
import { db } from "@/lib/db";
import { formatWindow, formatZar } from "@/lib/empty-legs-shared";
import { requireRole } from "@/lib/session";
import { ghostBtn, primaryBtn } from "@/components/ui/Field";

export const metadata: Metadata = { title: "My bookings — Lumiritin" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "bg-gold/15 text-gold-light",
  PENDING: "bg-gold/15 text-gold-light",
  CONFIRMED: "bg-emerald-status/15 text-emerald-status",
  DECLINED: "bg-alert/15 text-alert",
  CANCELLED: "bg-white/5 text-slate-tac",
};

export default async function BookingsPage() {
  const session = await requireRole("PASSENGER", "/dashboard/bookings");
  const user = await db.user.findUniqueOrThrow({ where: { id: session.sub }, select: { email: true, firstName: true } });

  const [charters, seats] = await Promise.all([
    db.charterBooking.findMany({ where: { userId: session.sub }, orderBy: { createdAt: "desc" } }),
    db.emptyLegBooking.findMany({
      where: { passengerEmail: user.email },
      orderBy: { createdAt: "desc" },
      include: { emptyLeg: { select: { originIcao: true, destinationIcao: true, departureStart: true, departureEnd: true, discountedPricePerSeatZar: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Passenger dashboard</p>
      <h1 className="mt-3 font-display text-5xl text-ivory">Welcome, {user.firstName}</h1>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-3xl text-ivory">Charter requests</h2>
          <Link href="/charter" className={primaryBtn}>New charter</Link>
        </div>
        {charters.length === 0 ? (
          <p className="glass rounded-3xl p-6 text-slate-tac">No charter requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {charters.map((c) => {
              const route = c.legs as { fromIcao: string; toIcao: string; date: string }[];
              return (
                <li key={c.id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
                  <div>
                    <p className="font-mono text-lg tracking-wider text-gold-light">{c.reference}</p>
                    <p className="text-ivory">{route.map((l) => `${l.fromIcao} → ${l.toIcao}`).join(" · ")}</p>
                    <p className="text-xs text-slate-tac">{aircraftClass(c.aircraftClass)?.label} · {c.passengers} pax · {route[0]?.date}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[c.status]}`}>{c.status.toLowerCase()}</span>
                    <p className="mt-2 text-sm text-slate-tac">≈ {formatZar(c.estimatedPriceZar)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-3xl text-ivory">Empty-leg seats</h2>
          <Link href="/empty-legs" className={ghostBtn}>Browse deals</Link>
        </div>
        {seats.length === 0 ? (
          <p className="glass rounded-3xl p-6 text-slate-tac">No seat requests yet. Requests made with {user.email} appear here.</p>
        ) : (
          <ul className="space-y-3">
            {seats.map((b) => (
              <li key={b.id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
                <div>
                  <p className="text-ivory">{b.emptyLeg.originIcao} → {b.emptyLeg.destinationIcao}</p>
                  <p className="text-xs text-slate-tac">{formatWindow(b.emptyLeg.departureStart.toISOString(), b.emptyLeg.departureEnd.toISOString())} · {b.seats} seat{b.seats > 1 ? "s" : ""}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[b.status]}`}>{b.status.toLowerCase()}</span>
                  <p className="mt-2 text-sm text-slate-tac">{formatZar(b.seats * b.emptyLeg.discountedPricePerSeatZar)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
