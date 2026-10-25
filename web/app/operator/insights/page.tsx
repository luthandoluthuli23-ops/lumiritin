import type { Metadata } from "next";
import Link from "next/link";
import { formatZar } from "@/lib/empty-legs-shared";
import { operatorInsights, operatorRoster } from "@/lib/insights";
import { requireOperator } from "@/lib/session";
import { ComponentBars, ReputationRing, TierBadge } from "@/components/insights/Reputation";

export const metadata: Metadata = { title: "Insights — Lumiritin" };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function OperatorInsightsPage() {
  const { operatorId } = await requireOperator();
  const [insights, pilots] = await Promise.all([operatorInsights(operatorId), operatorRoster(operatorId)]);

  const kpis: { label: string; value: string; note?: string }[] = [
    { label: "Crew requests posted", value: String(insights.requestsPosted) },
    { label: "Fill rate", value: insights.requestsPosted ? pct(insights.fillRate) : "—", note: `${insights.requestsFilled} filled` },
    { label: "Avg time to fill", value: insights.avgTimeToFillHours == null ? "—" : `${insights.avgTimeToFillHours} h` },
    { label: "Open requests", value: String(insights.openRequests) },
    { label: "Roster", value: `${insights.rosterActive}/${insights.rosterTotal}`, note: "active / total" },
    { label: "Bench earnings", value: formatZar(insights.benchEarningsZar), note: `${insights.benchJobs} job${insights.benchJobs === 1 ? "" : "s"}` },
    { label: "Fleet", value: String(insights.fleetCount) },
  ];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-5xl text-ivory">Insights</h1>
        <p className="mt-2 text-slate-tac">How your crewing performs, and how your pilots rank.</p>
      </header>

      <section>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.label} className="glass rounded-3xl p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-tac">{k.label}</p>
              <p className="mt-3 font-display text-4xl text-gold-gradient">{k.value}</p>
              {k.note && <p className="mt-1 text-xs text-slate-tac">{k.note}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl text-ivory">Crew performance</h2>
          <Link href="/operator/pilots" className="text-sm font-medium text-gold-light underline underline-offset-4">Manage your pilots →</Link>
        </div>

        {pilots.length === 0 ? (
          <p className="glass rounded-3xl p-8 text-slate-tac">
            No pilots on your roster yet. <Link href="/operator/pilots" className="text-gold-light underline">List your crew</Link> to rank their reliability.
          </p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {pilots.map((p, i) => {
              const s = p.reputation.stats;
              return (
                <li key={p.personId} className="glass rounded-3xl p-6">
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-slate-tac">#{i + 1}</span>
                    <ReputationRing score={p.reputation.score} tier={p.reputation.tier} size={64} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-2xl text-ivory">{p.fullName}</h3>
                        <TierBadge tier={p.reputation.tier} />
                      </div>
                      <p className="mt-1 text-xs text-slate-tac">
                        {s.dutiesCompleted} duties · {s.offersReceived ? pct(s.acceptRate) : "—"} accept ·{" "}
                        {s.avgResponseMinutes == null ? "—" : `${s.avgResponseMinutes} min reply`} · {s.totalHours.toLocaleString("en-ZA")} hrs
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ComponentBars components={p.reputation.components} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
