"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RosterPilot } from "@/lib/insights";
import { formatZar } from "@/lib/empty-legs-shared";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormError, apiErrorMessage, cardCls, dangerTextBtn } from "@/components/ui/Field";
import { ReputationRing, TierBadge } from "@/components/insights/Reputation";
import { PoolToggle } from "@/components/operator/PoolToggle";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function RosterTable({ pilots }: { pilots: RosterPilot[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(p: RosterPilot, init: RequestInit) {
    setBusyId(p.rosterId);
    setError(null);
    try {
      const res = await fetch(`/api/operator/roster/${p.rosterId}`, init);
      if (!res.ok) return setError(apiErrorMessage(await res.json().catch(() => null)));
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const togglePool = (p: RosterPilot) =>
    call(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharedToPool: !p.sharedToPool }) });

  function remove(p: RosterPilot) {
    if (confirm(`Remove ${p.fullName} from your roster?`)) void call(p, { method: "DELETE" });
  }

  if (pilots.length === 0) {
    return (
      <EmptyState title="No pilots on your roster yet">
        Invite your crew above. Once they accept, you&rsquo;ll see their live reputation here and can offer them to the shared pool to earn bench income.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <ul className="grid gap-4">
        {pilots.map((p) => {
          const s = p.reputation.stats;
          const busy = busyId === p.rosterId;
          return (
            <li key={p.rosterId} className={cardCls}>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
                <ReputationRing score={p.reputation.score} tier={p.reputation.tier} size={64} />
                <div className="min-w-[10rem] flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="min-w-0 break-words font-display text-2xl text-ivory">{p.fullName}</h3>
                    <TierBadge tier={p.reputation.tier} />
                  </div>
                  <p className="mt-1 text-xs text-slate-tac">
                    {p.homeAirfieldIcao ?? "—"} ·{" "}
                    {p.status === "ACTIVE" ? <span className="text-emerald-status">On roster</span> : <span className="text-gold-light">Invite pending</span>}
                    {p.sharedToPool && p.status === "ACTIVE" ? " · shared to pool" : ""}
                  </p>
                </div>

                <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 lg:w-auto">
                  <Stat label="Hours" value={s.totalHours.toLocaleString("en-ZA")} />
                  <Stat label="Accept rate" value={s.offersReceived ? pct(s.acceptRate) : "—"} />
                  <Stat label="Duties" value={String(s.dutiesCompleted)} />
                  <Stat label="Bench earned" value={s.earningsZar ? formatZar(s.earningsZar) : "—"} />
                </dl>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-4">
                {p.status === "ACTIVE" ? (
                  <PoolToggle shared={p.sharedToPool} busy={busy} onToggle={() => togglePool(p)} />
                ) : (
                  <span className="text-xs text-slate-tac">Waiting for the pilot to accept your invitation.</span>
                )}
                <button type="button" onClick={() => remove(p)} disabled={busy} className={dangerTextBtn}>
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-xs uppercase tracking-widest text-slate-tac">{label}</dt>
      <dd className="break-words text-ivory">{value}</dd>
    </div>
  );
}
