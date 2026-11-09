import type { Metadata } from "next";
import { formatZar } from "@/lib/empty-legs-shared";
import { operatorInsights, operatorRoster } from "@/lib/insights";
import { requireOperator } from "@/lib/session";
import { cardCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { InvitePilotForm } from "@/components/operator/InvitePilotForm";
import { RosterTable } from "@/components/operator/RosterTable";

export const metadata: Metadata = { title: "My pilots — Lumiritin" };

export default async function OperatorCrewPage() {
  const { operatorId } = await requireOperator();
  const [pilots, insights] = await Promise.all([operatorRoster(operatorId), operatorInsights(operatorId)]);

  const active = pilots.filter((p) => p.status === "ACTIVE").length;
  const shared = pilots.filter((p) => p.sharedToPool && p.status === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My pilots"
        subtitle="List your crew to see their live reputation, dispatch them first for your own flights, and earn bench income when you offer idle pilots to other operators."
      />

      {/* Why listing pilots pays off */}
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        <Benefit title="See who's reliable" body="Every pilot carries a live reputation from real accept rates, response times, credentials and hours." />
        <Benefit title="Dispatch yours first" body="Your rostered pilots are matched ahead of the open pool for your own crew requests." />
        <Benefit
          title="Earn from the bench"
          body={`Offer idle pilots to the shared pool and earn when they fill another operator's flight.${insights.benchEarningsZar ? ` You've earned ${formatZar(insights.benchEarningsZar)} so far.` : ""}`}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-tac">
        <span><b className="text-ivory">{active}</b> on roster</span>
        <span><b className="text-ivory">{shared}</b> shared to pool</span>
        <span><b className="text-ivory">{pilots.length - active}</b> pending invites</span>
      </div>

      <InvitePilotForm />
      <RosterTable pilots={pilots} />
    </div>
  );
}

function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <div className={cardCls}>
      <p className="text-xs uppercase tracking-[0.25em] text-gold">{title}</p>
      <p className="mt-2 text-sm text-slate-tac">{body}</p>
    </div>
  );
}
