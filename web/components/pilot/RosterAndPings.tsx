"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ghostBtn, primaryBtn } from "@/components/ui/Field";

export interface RosterRow {
  id: string;
  operatorName: string;
  status: "INVITED" | "ACTIVE";
  sharedToPool: boolean;
}

export interface PendingPing {
  token: string;
  operatorName: string;
  departureIcao: string;
  types: string;
  window: string;
  secondsLeft: number;
}

export function RosterAndPings({ roster, pings }: { roster: RosterRow[]; pings: PendingPing[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "accept" | "decline" | "leave") {
    setBusy(id);
    try {
      await fetch("/api/pilot/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (roster.length === 0 && pings.length === 0) return null;

  return (
    <div className="space-y-6">
      {pings.length > 0 && (
        <section className="glass rounded-3xl border border-gold/50 p-6 shadow-gold" aria-labelledby="pings-h">
          <h2 id="pings-h" className="font-display text-2xl text-gold-light">Crew requests waiting for you</h2>
          <ul className="mt-4 space-y-3">
            {pings.map((p) => (
              <li key={p.token} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
                <div>
                  <p className="text-ivory">{p.operatorName} · {p.departureIcao} · {p.types}</p>
                  <p className="text-xs text-slate-tac">{p.window} · about {Math.max(1, Math.ceil(p.secondsLeft / 60))} min left to respond</p>
                </div>
                <Link href={`/crew/respond/${p.token}`} className={primaryBtn}>Review &amp; respond</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roster.length > 0 && (
        <section className="glass rounded-3xl p-6" aria-labelledby="roster-h">
          <h2 id="roster-h" className="text-xs uppercase tracking-[0.25em] text-slate-tac">Operators you are rostered with</h2>
          <ul className="mt-4 space-y-3">
            {roster.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
                <div>
                  <p className="text-ivory">{r.operatorName}</p>
                  <p className="text-xs text-slate-tac">
                    {r.status === "INVITED"
                      ? "Invitation: accepting lets this operator see your availability and mark you busy for their own flights."
                      : r.sharedToPool
                        ? "Active. Other contributing operators can request you when you are idle."
                        : "Active. Only this operator can request you."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.status === "INVITED" ? (
                    <>
                      <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "accept")} className={primaryBtn}>Accept</button>
                      <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "decline")} className={ghostBtn}>Decline</button>
                    </>
                  ) : (
                    <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "leave")} className={ghostBtn}>Leave roster</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
