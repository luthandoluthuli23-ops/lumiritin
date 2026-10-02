"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AIRFIELDS } from "@/lib/airfields";
import { EASE_LUXE } from "@/lib/animations";

const TABS = [
  { id: "empty", label: "Empty Leg Deals" },
  { id: "charter", label: "Custom Charter Quote" },
  { id: "pilot", label: "Pilot Credential Lookup" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10";
const submitCls = "self-end rounded-xl bg-gold px-7 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60";

export function SearchTabs() {
  const [tab, setTab] = useState<TabId>("empty");

  return (
    <div className="glass mx-auto w-full max-w-5xl rounded-3xl p-3 shadow-gold sm:p-4">
      <div role="tablist" aria-label="Search type" className="relative flex gap-1 overflow-x-auto rounded-2xl bg-obsidian/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "text-obsidian" : "text-slate-tac hover:text-ivory"}`}
          >
            {tab === t.id && (
              <motion.span layoutId="tab-pill" transition={{ duration: 0.45, ease: EASE_LUXE }} className="absolute inset-0 rounded-xl bg-gold" />
            )}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="p-3 pt-5 sm:p-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {tab === "empty" && <RouteForm mode="empty" />}
            {tab === "charter" && <RouteForm mode="charter" />}
            {tab === "pilot" && <PilotLookup />}
          </motion.div>
        </AnimatePresence>
      </div>
      <datalist id="home-airfields">
        {Object.entries(AIRFIELDS).map(([icao, a]) => (
          <option key={icao} value={icao}>{`${a.city} — ${a.name}`}</option>
        ))}
      </datalist>
    </div>
  );
}

function RouteForm({ mode }: { mode: "empty" | "charter" }) {
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["from", "to", "date", "pax"]) {
      const v = String(f.get(key) ?? "").trim();
      if (v) params.set(key, v);
    }
    router.push(`${mode === "empty" ? "/empty-legs" : "/charter"}${params.size ? `?${params}` : ""}`);
  }

  return (
    <form onSubmit={onSubmit} className={`grid gap-4 sm:grid-cols-2 ${mode === "charter" ? "lg:grid-cols-[1fr_1fr_12rem_7rem_auto]" : "lg:grid-cols-[1fr_1fr_12rem_auto]"}`}>
      <Labeled label="From">
        <input name="from" list="home-airfields" placeholder="ICAO or city" className={inputCls} autoComplete="off" />
      </Labeled>
      <Labeled label="To">
        <input name="to" list="home-airfields" placeholder="ICAO or city" className={inputCls} autoComplete="off" />
      </Labeled>
      <Labeled label="Date">
        <input name="date" type="date" className={inputCls} />
      </Labeled>
      {mode === "charter" && (
        <Labeled label="Passengers">
          <input name="pax" type="number" min={1} max={20} defaultValue={2} className={inputCls} />
        </Labeled>
      )}
      <button type="submit" className={submitCls}>{mode === "empty" ? "Find deals" : "Get quote"}</button>
    </form>
  );
}

interface LookupResult {
  outcome: "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR";
  error: string | null;
  licence: { number: string; category: string | null; status: string | null; expires: string | null; ratings: { name: string; expires: string | null }[] } | null;
}

function PilotLookup() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const licence = String(new FormData(e.currentTarget).get("licence") ?? "").trim();
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch(`/api/verify?licence=${encodeURIComponent(licence)}`);
      const data = await res.json();
      if (res.status === 422) setMessage("Enter a licence number (letters, digits and hyphens, 4–20 characters).");
      else if (res.status === 429) setMessage("Too many lookups. Please wait a minute and try again.");
      else if (!res.ok) setMessage("Lookup failed. Please try again.");
      else if (data.outcome === "NOT_FOUND") setMessage("No licence found with that number.");
      else if (data.outcome !== "VERIFIED") setMessage("The SACAA portal is unavailable right now. Please try again later.");
      else setResult(data);
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Labeled label="SACAA licence number">
          <input name="licence" required placeholder="e.g. 0270999999" className={inputCls} autoComplete="off" />
        </Labeled>
        <button type="submit" disabled={busy} className={submitCls}>{busy ? "Checking…" : "Verify licence"}</button>
      </form>

      <div aria-live="polite">
        {message && <p className="mt-4 rounded-lg bg-white/5 px-4 py-3 text-sm text-slate-tac">{message}</p>}
        {result?.licence && (
          <div className="mt-4 rounded-2xl border border-emerald-status/30 bg-emerald-status/5 p-4 text-sm">
            <p className="font-medium text-emerald-status">
              {result.licence.category ?? "Licence"} {result.licence.number} · {result.licence.status ?? "status unknown"}
            </p>
            <p className="mt-1 text-slate-tac">Expires {result.licence.expires ?? "—"}</p>
            {result.licence.ratings.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.licence.ratings.map((r) => (
                  <li key={r.name} className="rounded-full bg-white/5 px-3 py-1 text-xs text-ivory">
                    {r.name}
                    {r.expires ? ` · ${r.expires}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-tac">{label}</span>
      {children}
    </label>
  );
}
