"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RosterPilot } from "@/lib/insights";
import { formatZar } from "@/lib/empty-legs-shared";
import { ReputationRing, TierBadge } from "@/components/insights/Reputation";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function RosterTable({ pilots }: { pilots: RosterPilot[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function togglePool(p: RosterPilot) {
    setBusyId(p.rosterId);
    try {
      await fetch(`/api/operator/roster/${p.rosterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedToPool: !p.sharedToPool }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: RosterPilot) {
    if (!confirm(`Remove ${p.fullName} from your roster?`)) return;
    setBusyId(p.rosterId);
    try {
      await fetch(`/api/operator/roster/${p.rosterId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (pilots.length === 0) {
    return (
      <div className="glass rounded-3xl p-8 text-center text-slate-tac">
        <p className="text-ivory">No pilots on your roster yet.</p>
        <p className="mt-2 text-sm">Invite your crew above. Once they accept, you&rsquo;ll see their live reputation here and can offer them to the shared pool to earn bench income.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {pilots.map((p) => {
        const s = p.reputation.stats;
        const busy = busyId === p.rosterId;
        return (
          <li key={p.rosterId} className="glass rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-5">
              <ReputationRing score={p.reputation.score} tier={p.reputation.tier} size={64} />
              <div className="min-w-[10rem] flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-2xl text-ivory">{p.fullName}</h3>
                  <TierBadge tier={p.reputation.tier} />
                </div>
                <p className="mt-1 text-xs text-slate-tac">
                  {p.homeAirfieldIcao ?? "—"} ·{" "}
                  {p.status === "ACTIVE" ? <span className="text-emerald-status">On roster</span> : <span className="text-gold-light">Invite pending</span>}
                  {p.sharedToPool && p.status === "ACTIVE" ? " · shared to pool" : ""}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <Stat label="Hours" value={s.totalHours.toLocaleString("en-ZA")} />
                <Stat label="Accept rate" value={s.offersReceived ? pct(s.acceptRate) : "—"} />
                <Stat label="Duties" value={String(s.dutiesCompleted)} />
                <Stat label="Bench earned" value={s.earningsZar ? formatZar(s.earningsZar) : "—"} />
              </dl>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              {p.status === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={() => togglePool(p)}
                  disabled={busy}
                  aria-pressed={p.sharedToPool}
                  className={`rounded-full px-4 py-1.5 text-sm transition disabled:opacity-50 ${p.sharedToPool ? "bg-gold text-obsidian" : "border border-white/20 text-ivory hover:border-gold/60"}`}
                >
                  {p.sharedToPool ? "Shared to pool ✓" : "Offer to shared pool"}
                </button>
              ) : (
                <span className="text-xs text-slate-tac">Waiting for the pilot to accept your invitation.</span>
              )}
              <button type="button" onClick={() => remove(p)} disabled={busy} className="rounded-full px-3 py-1.5 text-sm text-slate-tac transition hover:text-alert disabled:opacity-50">
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-ivory">{value}</dd>
      <dt className="text-[10px] uppercase tracking-widest text-slate-tac">{label}</dt>
    </div>
  );
}
