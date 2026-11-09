import type { Metadata } from "next";
import Link from "next/link";
import { formatZar } from "@/lib/empty-legs-shared";
import { operatorInsights, operatorRoster } from "@/lib/insights";
import { requireOperator } from "@/lib/session";
import { cardCls } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCards } from "@/components/operator/StatCards";
import { linkCls, standaloneLinkCls } from "@/components/operator/styles";
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
    <div className="space-y-8 sm:space-y-10">
      <PageHeader title="Insights" subtitle="How your crewing performs, and how your pilots rank." />

      <StatCards stats={kpis.map((k) => ({ ...k, href: null }))} />

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-3xl text-ivory">Crew performance</h2>
          <Link href="/operator/pilots" className={standaloneLinkCls}>Manage your pilots →</Link>
        </div>

        {pilots.length === 0 ? (
          <EmptyState title="No pilots on your roster yet">
            <Link href="/operator/pilots" className={linkCls}>List your crew</Link> to rank their reliability.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            {pilots.map((p, i) => {
              const s = p.reputation.stats;
              return (
                <li key={p.personId} className={cardCls}>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-slate-tac">#{i + 1}</span>
                    <ReputationRing score={p.reputation.score} tier={p.reputation.tier} size={64} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="min-w-0 break-words font-display text-2xl text-ivory">{p.fullName}</h3>
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
