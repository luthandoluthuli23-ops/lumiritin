import type { Metadata } from "next";
import Link from "next/link";
import { formatZar } from "@/lib/empty-legs-shared";
import { pilotReputation } from "@/lib/insights";
import { getPilotPersonId, requireRole } from "@/lib/session";
import { ComponentBars, ReputationRing, TierBadge } from "@/components/insights/Reputation";

export const metadata: Metadata = { title: "My reputation — Lumiritin" };
export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function PilotInsightsPage() {
  await requireRole("PILOT", "/wallet/insights");
  const personId = await getPilotPersonId();
  if (!personId) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-28">
        <p className="text-slate-tac">Finish setting up your pilot profile to start building your reputation.</p>
      </main>
    );
  }

  const rep = await pilotReputation(personId);
  const s = rep.stats;

  const tips: string[] = [];
  if (rep.components.reliability < 70) tips.push("Respond to crew pings quickly and only accept duties you can fly — reliability is the biggest part of your score.");
  if (rep.components.compliance < 80) tips.push("Keep your licence SACAA-verified and in date, and renew your medical before it lapses.");
  if (rep.components.experience < 60) tips.push("Log more hours and complete more duties through the platform to build experience.");
  if (s.offersReceived === 0) tips.push("Ask operators to add you to their roster so you start receiving duty offers.");

  const stats: { label: string; value: string }[] = [
    { label: "Duty offers", value: String(s.offersReceived) },
    { label: "Accept rate", value: s.offersReceived ? pct(s.acceptRate) : "—" },
    { label: "Avg reply", value: s.avgResponseMinutes == null ? "—" : `${s.avgResponseMinutes} min` },
    { label: "Duties completed", value: String(s.dutiesCompleted) },
    { label: "Upcoming", value: String(s.upcomingDuties) },
    { label: "Total hours", value: s.totalHours.toLocaleString("en-ZA") },
    { label: "Credentials verified", value: `${s.credentialsVerified}/${s.credentialsTotal}` },
    { label: "Bench earned", value: s.earningsZar ? formatZar(s.earningsZar) : "—" },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-28">
      <p className="mb-4 text-sm"><Link href="/wallet" className="text-gold-light underline underline-offset-4">← Credential wallet</Link></p>
      <h1 className="font-display text-5xl text-ivory">My reputation</h1>
      <p className="mt-2 text-slate-tac">Your standing with operators, built from how you respond, your credentials and your flying.</p>

      <div className="glass mt-8 flex flex-wrap items-center gap-8 rounded-3xl p-8">
        <div className="flex flex-col items-center gap-3">
          <ReputationRing score={rep.score} tier={rep.tier} size={128} />
          <TierBadge tier={rep.tier} />
        </div>
        <div className="min-w-[14rem] flex-1">
          <ComponentBars components={rep.components} />
          {!s.medicalValid && <p className="mt-4 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">No valid medical on file — this limits your matches.</p>}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((st) => (
          <div key={st.label} className="glass rounded-2xl p-4 text-center">
            <dd className="font-display text-3xl text-gold-gradient">{st.value}</dd>
            <dt className="mt-1 text-[10px] uppercase tracking-widest text-slate-tac">{st.label}</dt>
          </div>
        ))}
      </dl>

      {tips.length > 0 && (
        <section className="glass mt-6 rounded-3xl p-6">
          <h2 className="font-display text-2xl text-ivory">Grow your score</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-tac">
            {tips.map((t) => (
              <li key={t} className="flex gap-2"><span className="text-gold">→</span>{t}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
