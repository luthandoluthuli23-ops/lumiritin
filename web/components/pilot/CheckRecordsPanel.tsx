"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CHECK_TYPES, CHECK_TYPE_LABEL, checkStatus } from "@/lib/checks";

export interface CheckRow {
  id: string;
  checkType: string;
  aircraftType: string;
  completedAt: string; // ISO date
  examiner: string;
  expiresAt: string; // ISO date
}

const TONE: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-status/15 text-emerald-status",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-alert/15 text-alert",
};

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60";
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });

export function CheckRecordsPanel({ records }: { records: CheckRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkType: f.get("checkType"),
          aircraftType: f.get("aircraftType"),
          examiner: f.get("examiner"),
          completedAt: f.get("completedAt"),
          expiresAt: f.get("expiresAt"),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.issues?.[0]?.message ?? "Please check the fields and try again.");
        return;
      }
      form.reset();
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this check record?")) return;
    await fetch(`/api/pilot/checks/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const sorted = [...records].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ivory">Check records</h2>
        <button type="button" onClick={() => setAdding((a) => !a)} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-ivory transition hover:border-gold/60">
          {adding ? "Close" : "+ Add check"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-tac">Recurrent proficiency and rating checks. Status updates itself from the expiry date.</p>

      {adding && (
        <form onSubmit={add} className="mt-4 grid gap-3 rounded-2xl bg-white/5 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Check type</span>
            <select name="checkType" required defaultValue="PPC" className={inputCls}>
              {CHECK_TYPES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Aircraft type</span>
            <input name="aircraftType" required placeholder="e.g. H125" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Date completed</span>
            <input name="completedAt" type="date" required className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Examiner (DFE)</span>
            <input name="examiner" required placeholder="Examiner name" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Expiry date</span>
            <input name="expiresAt" type="date" required className={inputCls} />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="rounded-xl bg-gold px-5 py-2 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
              {busy ? "Saving…" : "Save check"}
            </button>
          </div>
          {error && <p className="sm:col-span-2 text-sm text-alert">{error}</p>}
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-slate-tac">No checks recorded yet. Add your PPC, instrument rating, line check and others to show you&rsquo;re current.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10">
          {sorted.map((r) => {
            const st = checkStatus(new Date(r.expiresAt));
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-[12rem]">
                  <p className="text-ivory">
                    {CHECK_TYPE_LABEL[r.checkType] ?? r.checkType} <span className="text-slate-tac">· {r.aircraftType}</span>
                  </p>
                  <p className="text-xs text-slate-tac">Completed {fmt(r.completedAt)} · {r.examiner} · expires {fmt(r.expiresAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${TONE[st.tone]}`}>{st.label}</span>
                  <button type="button" onClick={() => remove(r.id)} className="text-sm text-slate-tac transition hover:text-alert">Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
