import type { Metadata } from "next";
import { RosterManager, type RosterRowData } from "@/components/operator/RosterManager";
import { StatCards } from "@/components/operator/StatCards";
import { currentState, describeState } from "@/lib/availability";
import { BENCH_SHARE_PERCENT } from "@/lib/bench";
import { db } from "@/lib/db";
import { formatWindow, formatZar } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";

export const metadata: Metadata = { title: "Bench — Lumiritin" };

export default async function BenchPage() {
  const { operatorId } = await requireOperator();

  const [roster, earnings] = await Promise.all([
    db.crewRoster.findMany({
      where: { operatorId },
      orderBy: { createdAt: "asc" },
      include: { person: { select: { fullName: true, availability: { where: { endsAt: { gt: new Date(Date.now() - 86_400_000) } } } } } },
    }),
    db.benchEarning.findMany({
      where: { operatorId },
      orderBy: { createdAt: "desc" },
      include: { crewRequest: { select: { departureIcao: true, requiredRatings: true, startsAt: true, endsAt: true, operator: { select: { name: true } } } } },
    }),
  ]);

  const rows: RosterRowData[] = roster.map((r) => {
    const windows = r.person.availability.map((a) => ({ state: a.state, startsAt: a.startsAt, endsAt: a.endsAt }));
    const s = currentState(windows);
    return {
      id: r.id,
      name: r.person.fullName,
      status: r.status,
      sharedToPool: r.sharedToPool,
      state: s.state,
      stateLabel: describeState(s),
      blocks: r.person.availability
        .filter((a) => a.source === "OPERATOR" && a.operatorId === operatorId && a.endsAt > new Date())
        .map((a) => ({ id: a.id, label: formatWindow(a.startsAt.toISOString(), a.endsAt.toISOString()) })),
    };
  });

  const active = roster.filter((r) => r.status === "ACTIVE");
  const shared = active.filter((r) => r.sharedToPool).length;
  const total = earnings.reduce((s, e) => s + e.amountZar, 0);
  const contributes = shared > 0;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-5xl text-ivory">Bench</h1>
        <p className="mt-2 max-w-2xl text-slate-tac">Your parked pilots start earning for you. When a pilot on your roster takes a contract job for another operator, you accrue a share.</p>
      </header>

      <section className={`glass rounded-3xl border p-6 ${contributes ? "border-emerald-status/40" : "border-gold/40"}`} aria-labelledby="recip-h">
        <h2 id="recip-h" className="font-display text-2xl text-ivory">{contributes ? "Reciprocal access: unlocked" : "Reciprocal access: locked"}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-tac">
          {contributes
            ? `You offer ${shared} pilot${shared > 1 ? "s" : ""} to the shared pool, so your crew requests can also reach other operators' idle pilots.`
            : "Offer at least one rostered pilot to the shared pool to unlock priority access to other operators' idle crew. Until then, your requests only reach your own roster and freelance pilots."}
        </p>
      </section>

      <StatCards
        stats={[
          { label: "Accrued earnings (R)", value: total, href: null, note: "not yet paid out" },
          { label: "Jobs filled for others", value: earnings.length, href: null },
          { label: "Pilots on roster", value: active.length, href: null },
          { label: "Offered to pool", value: shared, href: null },
        ]}
      />
      <p className="-mt-6 text-xs text-slate-tac">
        Earnings are illustrative: {BENCH_SHARE_PERCENT}% of an assumed contract rate per hour. Both numbers are placeholders until commercial terms are set, and nothing is paid out automatically yet.
      </p>

      <section aria-labelledby="earn-h">
        <h2 id="earn-h" className="mb-4 font-display text-3xl text-ivory">Recent earnings</h2>
        {earnings.length === 0 ? (
          <p className="glass rounded-3xl p-6 text-slate-tac">None yet. Offer a rostered pilot to the pool and they will appear in other operators&rsquo; shortlists whenever they are idle.</p>
        ) : (
          <ul className="space-y-3">
            {earnings.map((e) => (
              <li key={e.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
                <div>
                  <p className="text-ivory">{e.crewRequest.operator.name} · {e.crewRequest.departureIcao} · {e.crewRequest.requiredRatings.join(", ")}</p>
                  <p className="text-xs text-slate-tac">{formatWindow(e.crewRequest.startsAt.toISOString(), e.crewRequest.endsAt.toISOString())} · {e.hoursBilled} h</p>
                </div>
                <p className="font-display text-2xl text-gold-gradient">{formatZar(e.amountZar)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="roster-h">
        <h2 id="roster-h" className="mb-4 font-display text-3xl text-ivory">Your roster</h2>
        <RosterManager rows={rows} />
      </section>
    </div>
  );
}
