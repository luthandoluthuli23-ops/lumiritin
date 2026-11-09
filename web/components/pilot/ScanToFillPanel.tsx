"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, type Tone } from "@/components/ui/Alert";
import { cardCls, dangerTextBtn, inputSmCls, primaryBtnSm } from "@/components/ui/Field";
import { SmField, fileInputCls, numOrUndef, scrollToPanel, stickyBarCls } from "./logbook-shared";

const SCAN_NUM = [
  ["totalHours", "Total time *"],
  ["picHours", "PIC"],
  ["coPilotHours", "Co-pilot"],
  ["dualHours", "Dual"],
  ["instructorHours", "Instructor"],
  ["nightHours", "Night"],
  ["instrumentHours", "Instrument"],
  ["dayLandings", "Day landings"],
  ["nightLandings", "Night landings"],
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

/** Scan a page: Lumi reads it, the pilot reviews every row, then saves. */
export function ScanToFillPanel({ onSaved }: { onSaved: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  useEffect(() => scrollToPanel(panelRef.current), []);

  async function scan() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setNotice({ tone: "warn", text: "Choose a photo or PDF of your logbook page first." }); return; }
    setBusy(true); setNotice(null); setRows(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/logbook/scan", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) { setNotice({ tone: "err", text: d?.message ?? "Couldn't read that page." }); return; }
      setRows((d.flights as Record<string, unknown>[]).map(toDraft));
      setNotice({ tone: "ok", text: `Lumi read ${d.flights.length} flight${d.flights.length === 1 ? "" : "s"}. Check each row, then save.` });
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows) return;
    const ready = rows.filter(rowComplete);
    if (ready.length === 0) { setNotice({ tone: "warn", text: "Each flight needs at least a date and a total time." }); return; }
    setSaving(true); setNotice(null);
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
      if (!res.ok) {
        const issue = d?.issues?.[0]?.message;
        setNotice({ tone: "err", text: issue ? `Couldn't save those flights: ${issue}` : d?.message ?? "Couldn't save those flights." });
        return;
      }
      onSaved();
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const setCell = (i: number, k: keyof DraftRow) => (e: ChangeEvent<HTMLInputElement>) =>
    setRows((prev) => (prev ? prev.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) : prev));
  const removeRow = (i: number) => setRows((prev) => (prev ? prev.filter((_, j) => j !== i) : prev));
  const readyCount = rows?.filter(rowComplete).length ?? 0;

  return (
    <section ref={panelRef} aria-labelledby="scan-h" className={`${cardCls} scroll-mt-28 border border-gold/40`}>
      <h2 id="scan-h" className="font-display text-2xl text-ivory">Scan a page to fill in</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Snap or upload a photo (or PDF) of a logbook page and Lumi reads each flight off it. You review and
        correct every row below, then save — nothing is stored until you do.
      </p>
      <p className="mt-2 text-sm text-slate-tac">The file is sent to our AI provider (Anthropic) to be read and is not stored by Lumiritin.</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref={inputRef} type="file" aria-label="Photo or PDF of a logbook page" accept="application/pdf,image/jpeg,image/png,image/webp" className={fileInputCls} />
        <button type="button" onClick={scan} disabled={busy || saving} className={`${primaryBtnSm} w-full shrink-0 sm:w-auto`}>
          {busy ? "Reading…" : "Read page"}
        </button>
      </div>
      {notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>}

      {rows && rows.length > 0 && (
        <>
          <div className="mt-5 space-y-4">
            {rows.map((r, i) => (
              <div key={i} className={`rounded-2xl p-4 ${rowComplete(r) ? "bg-white/5" : "border border-warn/40 bg-warn/5"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-tac">
                    Flight {i + 1}
                    {!rowComplete(r) && <span className="ml-2 text-warn">needs a date & total</span>}
                  </p>
                  <button type="button" onClick={() => removeRow(i)} className={dangerTextBtn}>Remove</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SmField label="Date *"><input type="date" value={r.date} onChange={setCell(i, "date")} className={inputSmCls} /></SmField>
                  <SmField label="From"><input value={r.departureIcao} onChange={setCell(i, "departureIcao")} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={inputSmCls} /></SmField>
                  <SmField label="To"><input value={r.arrivalIcao} onChange={setCell(i, "arrivalIcao")} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={inputSmCls} /></SmField>
                  <SmField label="Type"><input value={r.aircraftType} onChange={setCell(i, "aircraftType")} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={inputSmCls} /></SmField>
                  <SmField label="Registration"><input value={r.aircraftReg} onChange={setCell(i, "aircraftReg")} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={inputSmCls} /></SmField>
                  <SmField label="Certified by"><input value={r.certifier} onChange={setCell(i, "certifier")} className={inputSmCls} /></SmField>
                </div>
                <div className="mt-3 grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {SCAN_NUM.map(([k, label]) => (
                    <SmField key={k} label={label}><input inputMode="decimal" value={r[k]} onChange={setCell(i, k)} className={inputSmCls} /></SmField>
                  ))}
                </div>
                <div className="mt-3">
                  <SmField label="Remarks"><input value={r.remarks} onChange={setCell(i, "remarks")} className={inputSmCls} /></SmField>
                </div>
              </div>
            ))}
          </div>
          <div className={stickyBarCls}>
            <button type="button" onClick={save} disabled={saving || readyCount === 0} className={primaryBtnSm}>
              {saving ? "Saving…" : `Save ${readyCount} flight${readyCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
