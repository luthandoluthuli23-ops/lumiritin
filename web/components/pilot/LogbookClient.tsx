"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface LogbookEntryDTO {
  id: string;
  date: string;
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftType: string | null;
  aircraftReg: string | null;
  operatorName: string | null;
  totalHours: number;
  picHours: number | null;
  coPilotHours: number | null;
  dualHours: number | null;
  instructorHours: number | null;
  nightHours: number | null;
  instrumentHours: number | null;
  multiEngineHours: number | null;
  turbineHours: number | null;
  dayLandings: number;
  nightLandings: number;
  certifier: string | null;
  source: "PLATFORM" | "IMPORTED" | "MANUAL";
  verified: boolean;
  remarks: string | null;
}

type Hours = Record<"totalHours" | "picHours" | "nightHours" | "instrumentHours" | "multiEngineHours" | "turbineHours", number>;

interface Props {
  entries: LogbookEntryDTO[];
  totals: { grand: Hours; broughtForward: Hours; logged: Hours; entryCount: number; lastFlight: string | null };
  currency: { passengerCurrent: boolean; landings90: number; lapsesAt: string | null; nightCurrent: boolean; nightLandings90: number };
  provider: string | null;
  providerRef: string | null;
  broughtForwardHours: number;
  lumiLive: boolean;
  myFlightbookLive: boolean;
  flash: { tone: "ok" | "err"; text: string } | null;
}

const h1 = (x: number) => x.toLocaleString("en-ZA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SOURCE_BADGE: Record<LogbookEntryDTO["source"], { label: string; cls: string }> = {
  PLATFORM: { label: "Lumiritin · verified", cls: "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" },
  IMPORTED: { label: "Imported", cls: "border-white/15 bg-white/5 text-slate-tac" },
  MANUAL: { label: "Manual", cls: "border-white/15 bg-white/5 text-slate-tac" },
};

export function LogbookClient({ entries, totals, currency, provider, providerRef, broughtForwardHours, lumiLive, myFlightbookLive, flash }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<LogbookEntryDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Your hours, verified</p>
          <h1 className="mt-2 font-display text-5xl text-ivory">Logbook</h1>
        </div>
        <CurrencyBadge currency={currency} />
      </header>

      {flash && (
        <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${flash.tone === "ok" ? "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" : "border-amber-300/40 bg-amber-300/10 text-amber-100"}`}>
          {flash.text}
        </div>
      )}

      {/* Grand total + category breakdown */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-tac">Total time</p>
          <p className="mt-1 font-display text-4xl text-ivory">{h1(totals.grand.totalHours)}<span className="ml-1 text-base text-slate-tac">hrs</span></p>
          <p className="mt-1 text-xs text-slate-tac">
            {h1(totals.logged.totalHours)} logged here{broughtForwardHours > 0 ? ` · ${h1(broughtForwardHours)} brought forward` : ""}
          </p>
        </div>
        <Stat label="Pilot-in-command" value={totals.grand.picHours} />
        <Stat label="Night" value={totals.grand.nightHours} />
        <Stat label="Instrument" value={totals.grand.instrumentHours} />
        <Stat label="Multi-engine" value={totals.grand.multiEngineHours} />
        <Stat label="Turbine" value={totals.grand.turbineHours} />
      </section>

      {/* Import + add actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <button onClick={() => { setAdding((v) => !v); setEditing(null); setScanning(false); }} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
          {adding ? "Close" : "+ Add a flight"}
        </button>
        {lumiLive && (
          <button onClick={() => { setScanning((v) => !v); setAdding(false); setEditing(null); }} className="rounded-xl border border-gold/40 bg-gold/5 px-5 py-2.5 text-sm font-semibold text-gold-light transition hover:bg-gold/10">
            {scanning ? "Close" : "📷 Scan a page to fill in"}
          </button>
        )}
      </div>

      {scanning && <ScanToFillPanel onSaved={() => { setScanning(false); router.refresh(); }} />}

      {(adding || editing) && (
        <FlightForm
          key={editing?.id ?? "new"}
          initial={editing}
          onDone={() => { setAdding(false); setEditing(null); router.refresh(); }}
          onCancel={() => { setAdding(false); setEditing(null); }}
        />
      )}

      <ConnectPanel myFlightbookLive={myFlightbookLive} connectedProvider={provider} />

      <ImportPanel provider={provider} providerRef={providerRef} lumiLive={lumiLive} onImported={() => router.refresh()} />

      {/* Entries */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-tac">
          Flights {totals.entryCount > 0 && <span className="text-slate-tac/70">({totals.entryCount})</span>}
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-tac">
            No flights yet. Fly a job through Lumiritin and it appears here automatically — or import your existing logbook or add a flight above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-tac">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Route</th>
                  <th className="px-3 py-2.5">Aircraft</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">PIC</th>
                  <th className="px-3 py-2.5 text-right">Co-pilot</th>
                  <th className="px-3 py-2.5 text-right">Dual</th>
                  <th className="px-3 py-2.5 text-right">Instr</th>
                  <th className="px-3 py-2.5 text-right">Night</th>
                  <th className="px-3 py-2.5 text-right">Inst</th>
                  <th className="px-3 py-2.5 text-right">Ldg</th>
                  <th className="px-3 py-2.5">Certified by</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((e) => {
                  const badge = SOURCE_BADGE[e.source];
                  return (
                    <tr key={e.id} className="text-ivory/90">
                      <td className="whitespace-nowrap px-3 py-2.5">{e.date}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{[e.departureIcao, e.arrivalIcao].filter(Boolean).join(" → ") || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{[e.aircraftType, e.aircraftReg].filter(Boolean).join(" · ") || "—"}{e.operatorName ? <span className="block text-xs text-slate-tac">{e.operatorName}</span> : null}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h1(e.totalHours)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.picHours != null ? h1(e.picHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.coPilotHours != null ? h1(e.coPilotHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.dualHours != null ? h1(e.dualHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.instructorHours != null ? h1(e.instructorHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.nightHours != null ? h1(e.nightHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.instrumentHours != null ? h1(e.instrumentHours) : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{e.dayLandings + e.nightLandings || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-tac">{e.certifier || "—"}</td>
                      <td className="px-3 py-2.5"><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${badge.cls}`}>{badge.label}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <button onClick={() => { setEditing(e); setAdding(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs text-gold-light underline underline-offset-2">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-tac">
        Hours you fly through Lumiritin are logged automatically and witnessed by the booking operator. Imported and
        manual flights are self-declared. Currency is based on the landings you&apos;ve logged.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-tac">{label}</p>
      <p className="mt-1 font-display text-3xl text-ivory">{h1(value)}<span className="ml-1 text-sm text-slate-tac">hrs</span></p>
    </div>
  );
}

function CurrencyBadge({ currency }: { currency: Props["currency"] }) {
  const cls = currency.passengerCurrent ? "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" : "border-amber-300/40 bg-amber-300/10 text-amber-100";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      <p className="font-medium">{currency.passengerCurrent ? "Passenger-current ✓" : "Not passenger-current"}</p>
      <p className="mt-0.5 text-xs opacity-90">
        {currency.landings90} landing{currency.landings90 === 1 ? "" : "s"} in 90 days
        {currency.passengerCurrent && currency.lapsesAt ? ` · lapses ${currency.lapsesAt}` : " · need 3"}
      </p>
    </div>
  );
}

// ─── Add / edit flight ────────────────────────────────────────────────────────

const NUM_FIELDS = [
  ["picHours", "PIC"],
  ["coPilotHours", "Co-pilot / SIC"],
  ["dualHours", "Dual / P-u-t"],
  ["instructorHours", "Instructor"],
  ["nightHours", "Night"],
  ["instrumentHours", "Instrument"],
  ["multiEngineHours", "Multi-engine"],
  ["turbineHours", "Turbine"],
] as const;

function FlightForm({ initial, onDone, onCancel }: { initial: LogbookEntryDTO | null; onDone: () => void; onCancel: () => void }) {
  const isEdit = !!initial;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState(() => ({
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    departureIcao: initial?.departureIcao ?? "",
    arrivalIcao: initial?.arrivalIcao ?? "",
    aircraftType: initial?.aircraftType ?? "",
    aircraftReg: initial?.aircraftReg ?? "",
    totalHours: initial?.totalHours?.toString() ?? "",
    picHours: initial?.picHours?.toString() ?? "",
    coPilotHours: initial?.coPilotHours?.toString() ?? "",
    dualHours: initial?.dualHours?.toString() ?? "",
    instructorHours: initial?.instructorHours?.toString() ?? "",
    nightHours: initial?.nightHours?.toString() ?? "",
    instrumentHours: initial?.instrumentHours?.toString() ?? "",
    multiEngineHours: initial?.multiEngineHours?.toString() ?? "",
    turbineHours: initial?.turbineHours?.toString() ?? "",
    dayLandings: (initial?.dayLandings ?? 0).toString(),
    nightLandings: (initial?.nightLandings ?? 0).toString(),
    certifier: initial?.certifier ?? "",
    remarks: initial?.remarks ?? "",
  }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    const total = Number(f.totalHours);
    if (!f.date || !Number.isFinite(total) || total <= 0) { setErr("A date and a total time are required."); return; }
    setBusy(true);
    setErr(null);
    const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const body = {
      date: f.date,
      departureIcao: f.departureIcao || undefined,
      arrivalIcao: f.arrivalIcao || undefined,
      aircraftType: f.aircraftType || undefined,
      aircraftReg: f.aircraftReg || undefined,
      totalHours: total,
      picHours: numOrUndef(f.picHours),
      coPilotHours: numOrUndef(f.coPilotHours),
      dualHours: numOrUndef(f.dualHours),
      instructorHours: numOrUndef(f.instructorHours),
      nightHours: numOrUndef(f.nightHours),
      instrumentHours: numOrUndef(f.instrumentHours),
      multiEngineHours: numOrUndef(f.multiEngineHours),
      turbineHours: numOrUndef(f.turbineHours),
      dayLandings: numOrUndef(f.dayLandings),
      nightLandings: numOrUndef(f.nightLandings),
      certifier: f.certifier || undefined,
      remarks: f.remarks || undefined,
    };
    try {
      const res = await fetch(isEdit ? `/api/logbook/entries/${initial!.id}` : "/api/logbook/entries", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setErr(d?.issues?.[0]?.message ?? d?.message ?? "Couldn't save that flight.");
        return;
      }
      onDone();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!initial) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/logbook/entries/${initial.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => null); setErr(d?.message ?? "Couldn't delete."); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-white/10 bg-obsidian/60 px-3 py-2 text-sm text-ivory focus:border-gold/50 focus:outline-none";
  const field = (label: string, el: React.ReactNode) => (
    <label className="block"><span className="mb-1 block text-xs text-slate-tac">{label}</span>{el}</label>
  );

  return (
    <div className="mt-4 rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <p className="font-medium text-ivory">{isEdit ? "Edit flight" : "Add a flight"}{isEdit && initial?.source === "PLATFORM" ? <span className="ml-2 text-xs text-slate-tac">(Lumiritin flight — adjust the hour split)</span> : null}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("Date", <input type="date" value={f.date} onChange={set("date")} className={input} />)}
        {field("From (ICAO)", <input value={f.departureIcao} onChange={set("departureIcao")} placeholder="FALA" className={input} />)}
        {field("To (ICAO)", <input value={f.arrivalIcao} onChange={set("arrivalIcao")} placeholder="FACT" className={input} />)}
        {field("Aircraft type", <input value={f.aircraftType} onChange={set("aircraftType")} placeholder="PC12" className={input} />)}
        {field("Registration", <input value={f.aircraftReg} onChange={set("aircraftReg")} placeholder="ZS-ABC" className={input} />)}
        {field("Total time *", <input inputMode="decimal" value={f.totalHours} onChange={set("totalHours")} placeholder="1.5" className={input} />)}
        {NUM_FIELDS.map(([k, label]) => field(label, <input key={k} inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="0.0" className={input} />))}
        {field("Day landings", <input inputMode="numeric" value={f.dayLandings} onChange={set("dayLandings")} className={input} />)}
        {field("Night landings", <input inputMode="numeric" value={f.nightLandings} onChange={set("nightLandings")} className={input} />)}
        <div className="sm:col-span-2">{field("Certified by (CFI / PIC sign & licence no.)", <input value={f.certifier} onChange={set("certifier")} placeholder="J. Smith 12345" className={input} />)}</div>
        <div className="sm:col-span-2 lg:col-span-4">{field("Remarks, maneuvers, operations & endorsements", <input value={f.remarks} onChange={set("remarks")} className={input} />)}</div>
      </div>
      {err && <p className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-200">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={busy} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add flight"}
        </button>
        <button onClick={onCancel} className="text-sm text-slate-tac underline underline-offset-2">Cancel</button>
        {isEdit && initial?.source !== "PLATFORM" && (
          <button onClick={del} disabled={busy} className="ml-auto text-sm text-red-300 underline underline-offset-2">Delete flight</button>
        )}
      </div>
    </div>
  );
}

// ─── Scan a page to fill in (Lumi reads it → you review → save) ──────────────

const SCAN_NUM = [
  ["totalHours", "Total *"],
  ["picHours", "PIC"],
  ["coPilotHours", "Co-pilot"],
  ["dualHours", "Dual"],
  ["instructorHours", "Instr"],
  ["nightHours", "Night"],
  ["instrumentHours", "Inst"],
  ["dayLandings", "Day ldg"],
  ["nightLandings", "Night ldg"],
] as const;

type DraftRow = {
  date: string; departureIcao: string; arrivalIcao: string; aircraftType: string; aircraftReg: string;
  totalHours: string; picHours: string; coPilotHours: string; dualHours: string; instructorHours: string;
  nightHours: string; instrumentHours: string; multiEngineHours: string; turbineHours: string;
  dayLandings: string; nightLandings: string; certifier: string; remarks: string;
};

const s = (v: unknown): string => (v == null ? "" : String(v));
function toDraft(r: Record<string, unknown>): DraftRow {
  return {
    date: s(r.date), departureIcao: s(r.departureIcao), arrivalIcao: s(r.arrivalIcao),
    aircraftType: s(r.aircraftType), aircraftReg: s(r.aircraftReg), totalHours: s(r.totalHours),
    picHours: s(r.picHours), coPilotHours: s(r.coPilotHours), dualHours: s(r.dualHours),
    instructorHours: s(r.instructorHours), nightHours: s(r.nightHours), instrumentHours: s(r.instrumentHours),
    multiEngineHours: s(r.multiEngineHours), turbineHours: s(r.turbineHours),
    dayLandings: s(r.dayLandings), nightLandings: s(r.nightLandings), certifier: s(r.certifier), remarks: s(r.remarks),
  };
}
const rowComplete = (r: DraftRow) => !!r.date && Number(r.totalHours) > 0;

function ScanToFillPanel({ onSaved }: { onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err" | null>(null);

  async function scan() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setTone("warn"); setMsg("Choose a photo or PDF of your logbook page first."); return; }
    setBusy(true); setMsg(null); setTone(null); setRows(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/logbook/scan", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) { setTone("err"); setMsg(d?.message ?? "Couldn't read that page."); return; }
      setRows((d.flights as Record<string, unknown>[]).map(toDraft));
      setTone("ok");
      setMsg(`Lumi read ${d.flights.length} flight${d.flights.length === 1 ? "" : "s"}. Check each row, then save.`);
    } catch {
      setTone("err"); setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows) return;
    const ready = rows.filter(rowComplete);
    if (ready.length === 0) { setTone("warn"); setMsg("Each flight needs at least a date and a total time."); return; }
    setSaving(true); setMsg(null); setTone(null);
    const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const flights = ready.map((r) => ({
      date: r.date,
      departureIcao: r.departureIcao || undefined,
      arrivalIcao: r.arrivalIcao || undefined,
      aircraftType: r.aircraftType || undefined,
      aircraftReg: r.aircraftReg || undefined,
      totalHours: Number(r.totalHours),
      picHours: numOrUndef(r.picHours),
      coPilotHours: numOrUndef(r.coPilotHours),
      dualHours: numOrUndef(r.dualHours),
      instructorHours: numOrUndef(r.instructorHours),
      nightHours: numOrUndef(r.nightHours),
      instrumentHours: numOrUndef(r.instrumentHours),
      multiEngineHours: numOrUndef(r.multiEngineHours),
      turbineHours: numOrUndef(r.turbineHours),
      dayLandings: numOrUndef(r.dayLandings),
      nightLandings: numOrUndef(r.nightLandings),
      certifier: r.certifier || undefined,
      remarks: r.remarks || undefined,
    }));
    try {
      const res = await fetch("/api/logbook/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flights }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) { setTone("err"); setMsg(d?.message ?? "Couldn't save those flights."); return; }
      onSaved();
    } catch {
      setTone("err"); setMsg("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const setCell = (i: number, k: keyof DraftRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) : prev));
  const removeRow = (i: number) => setRows((prev) => (prev ? prev.filter((_, j) => j !== i) : prev));

  const toneCls = tone === "ok" ? "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" : tone === "warn" ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-red-400/40 bg-red-400/10 text-red-200";
  const cell = "w-full rounded-md border border-white/10 bg-obsidian/60 px-2 py-1.5 text-xs text-ivory focus:border-gold/50 focus:outline-none";
  const lbl = (t: string, el: React.ReactNode) => (<label className="block"><span className="mb-0.5 block text-[10px] uppercase tracking-wide text-slate-tac">{t}</span>{el}</label>);
  const readyCount = rows?.filter(rowComplete).length ?? 0;

  return (
    <div className="mt-4 rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <p className="font-medium text-ivory">Scan a page to fill in</p>
      <p className="mt-1 text-xs text-slate-tac">
        Snap or upload a photo (or PDF) of a logbook page and Lumi reads each flight off it. You review and
        correct every row below, then save — nothing is stored until you do.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block max-w-full text-xs text-slate-tac file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-ivory hover:file:bg-white/15"
        />
        <button onClick={scan} disabled={busy || saving} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
          {busy ? "Reading…" : "Read page"}
        </button>
      </div>
      {msg && <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${toneCls}`}>{msg}</p>}

      {rows && rows.length > 0 && (
        <div className="mt-5 space-y-4">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-xl border p-3 ${rowComplete(r) ? "border-white/10 bg-white/5" : "border-amber-300/40 bg-amber-300/5"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-tac">Flight {i + 1}{!rowComplete(r) && <span className="ml-2 text-amber-200">needs a date & total</span>}</span>
                <button onClick={() => removeRow(i)} className="text-xs text-red-300 underline underline-offset-2">Remove</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {lbl("Date *", <input type="date" value={r.date} onChange={setCell(i, "date")} className={cell} />)}
                {lbl("From", <input value={r.departureIcao} onChange={setCell(i, "departureIcao")} className={cell} />)}
                {lbl("To", <input value={r.arrivalIcao} onChange={setCell(i, "arrivalIcao")} className={cell} />)}
                {lbl("Type", <input value={r.aircraftType} onChange={setCell(i, "aircraftType")} className={cell} />)}
                {lbl("Reg", <input value={r.aircraftReg} onChange={setCell(i, "aircraftReg")} className={cell} />)}
                {SCAN_NUM.map(([k, t]) => lbl(t, <input key={k} inputMode="decimal" value={r[k]} onChange={setCell(i, k)} className={cell} />))}
                {lbl("Certified by", <input value={r.certifier} onChange={setCell(i, "certifier")} className={cell} />)}
                <div className="sm:col-span-2 lg:col-span-4">{lbl("Remarks", <input value={r.remarks} onChange={setCell(i, "remarks")} className={cell} />)}</div>
              </div>
            </div>
          ))}
          <button onClick={save} disabled={saving || readyCount === 0} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
            {saving ? "Saving…" : `Save ${readyCount} flight${readyCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Connect a logbook (authenticated bridge) ───────────────────────────────

function ConnectPanel({ myFlightbookLive, connectedProvider }: { myFlightbookLive: boolean; connectedProvider: string | null }) {
  const isConnected = connectedProvider?.toLowerCase() === "myflightbook";
  return (
    <div className="mt-8 rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <p className="font-medium text-ivory">Connect your logbook — the seamless way</p>
      <p className="mt-1 text-xs text-slate-tac">
        Already keep a detailed logbook elsewhere? Connect it and your whole history transfers across — no files, no re-typing.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {myFlightbookLive ? (
          <a href="/api/logbook/connect/myflightbook" className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
            {isConnected ? "Re-sync MyFlightbook" : "Connect MyFlightbook"}
          </a>
        ) : (
          <span className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-slate-tac">MyFlightbook — connection coming soon</span>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-tac">
        <strong className="text-ivory">On ForeFlight, LogTen or Garmin?</strong> They don&apos;t allow a direct pull, so the fastest route is a one-time
        export below — a CSV, or just snap your logbook pages and let Lumi read them. Export tips: <span className="text-ivory">ForeFlight</span> → More ·
        Logbook · Export; <span className="text-ivory">LogTen</span> → File · Export · CSV; <span className="text-ivory">MyFlightbook</span> → website · Logbook · Export.
      </p>
    </div>
  );
}

// ─── Import an existing logbook ─────────────────────────────────────────────

function ImportPanel({ provider, providerRef, lumiLive, onImported }: { provider: string | null; providerRef: string | null; lumiLive: boolean; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prov, setProv] = useState(provider ?? "");
  const [ref, setRef] = useState(providerRef ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setTone("warn"); setMsg("Choose your logbook file first — a CSV export, or a PDF/photo."); return; }
    setBusy(true); setMsg(null); setTone(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (prov.trim()) body.append("provider", prov.trim());
      if (ref.trim()) body.append("ref", ref.trim());
      const res = await fetch("/api/logbook/import", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) { setTone("err"); setMsg(d?.message ?? "Couldn't import that file."); return; }
      setTone("ok");
      if (d.mode === "csv") {
        setMsg(`Imported ${d.imported} flight${d.imported === 1 ? "" : "s"}${d.skipped ? ` (${d.skipped} row${d.skipped === 1 ? "" : "s"} skipped)` : ""}.`);
      } else if (d.mode === "lumi-flights") {
        setMsg(`Lumi read ${d.imported} flight${d.imported === 1 ? "" : "s"} off your logbook and added them.`);
      } else {
        setMsg(`Lumi read ${h1(d.totalHours)} total hours and set them as your brought-forward balance.`);
      }
      onImported();
    } catch {
      setTone("err"); setMsg("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const toneCls = tone === "ok" ? "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" : tone === "warn" ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : "border-red-400/40 bg-red-400/10 text-red-200";
  const input = "w-full rounded-lg border border-white/10 bg-obsidian/60 px-3 py-2 text-sm text-ivory focus:border-gold/50 focus:outline-none";

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="font-medium text-ivory">Or upload it — once</p>
      <p className="mt-1 text-xs text-slate-tac">
        Export a <strong className="text-ivory">CSV</strong> from ForeFlight, LogTen, MyFlightbook or any logbook (parsed exactly, flight by flight)
        {lumiLive ? ", or just upload a PDF or photos of your logbook pages and Lumi reads each flight off them" : ""}.
        After this, flights you fly through Lumiritin keep logging themselves.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-slate-tac">Which logbook? (optional)</span><input value={prov} onChange={(e) => setProv(e.target.value)} placeholder="ForeFlight" className={input} /></label>
        <label className="block"><span className="mb-1 block text-xs text-slate-tac">Your handle / number there (optional)</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="for your reference" className={input} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={lumiLive ? ".csv,text/csv,application/vnd.ms-excel,application/pdf,image/jpeg,image/png,image/webp" : ".csv,text/csv,application/vnd.ms-excel"}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block max-w-full text-xs text-slate-tac file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-ivory hover:file:bg-white/15"
        />
        <button onClick={submit} disabled={busy} className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-ivory transition hover:bg-white/15 disabled:opacity-60">
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {fileName && !msg && <p className="mt-2 text-xs text-slate-tac">Selected: {fileName}</p>}
      {msg && <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${toneCls}`}>{msg}</p>}
    </div>
  );
}
