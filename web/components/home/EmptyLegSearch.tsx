"use client";

import { type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AIRFIELDS } from "@/lib/airfields";

const inputCls =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10 pointer-coarse:text-base";
const submitCls = "self-end rounded-xl bg-gold px-7 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light pointer-coarse:min-h-11";

/** The homepage search box: empty-leg deals by route and date (the public licence lookup it used to have is gone). */
export function EmptyLegSearch() {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["from", "to", "date"]) {
      const v = String(f.get(key) ?? "").trim();
      if (v) params.set(key, v);
    }
    router.push(`/empty-legs${params.size ? `?${params}` : ""}`);
  }

  return (
    <div className="glass mx-auto w-full max-w-5xl rounded-3xl p-3 shadow-gold sm:p-4">
      <p className="rounded-2xl bg-obsidian/60 p-1">
        <span className="block rounded-xl bg-gold px-4 py-2.5 text-center text-sm font-medium text-obsidian sm:inline-block">Empty Leg Deals</span>
      </p>
      <form onSubmit={onSubmit} className="grid gap-4 p-3 pt-5 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1fr_1fr_12rem_auto]">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">From</span>
          <input name="from" list="home-airfields" placeholder="ICAO or city" className={inputCls} autoComplete="off" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">To</span>
          <input name="to" list="home-airfields" placeholder="ICAO or city" className={inputCls} autoComplete="off" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-slate-tac">Date</span>
          <input name="date" type="date" className={inputCls} />
        </label>
        <button type="submit" className={submitCls}>Find deals</button>
      </form>
      <datalist id="home-airfields">
        {Object.entries(AIRFIELDS).map(([icao, a]) => (
          <option key={icao} value={icao}>{`${a.city} — ${a.name}`}</option>
        ))}
      </datalist>
    </div>
  );
}
