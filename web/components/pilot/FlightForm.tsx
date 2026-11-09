"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { FormError, TextField, cardCls, dangerBtn, dangerTextBtn, ghostBtnSm, primaryBtnSm } from "@/components/ui/Field";
import { issueMessage, numOrUndef, scrollToPanel, stickyBarCls, todayLocal, type LogbookEntryDTO } from "./logbook-shared";

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

// Names the API uses in validation issues, so "totalHours: Number must be …" reads as "Total time: Number must be …".
const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  departureIcao: "From",
  arrivalIcao: "To",
  aircraftType: "Aircraft type",
  aircraftReg: "Registration",
  totalHours: "Total time",
  dayLandings: "Day landings",
  nightLandings: "Night landings",
  certifier: "Certified by",
  remarks: "Remarks",
  ...Object.fromEntries(NUM_FIELDS),
};

export function FlightForm({ initial, onDone, onCancel }: { initial: LogbookEntryDTO | null; onDone: () => void; onCancel: () => void }) {
  const isEdit = !!initial;
  const canDelete = isEdit && initial.source !== "PLATFORM";
  const panelRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [f, setF] = useState(() => ({
    date: initial?.date ?? todayLocal(),
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
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  // Bring the form into view when it opens (Edit is tapped far down the list on a phone).
  useEffect(() => scrollToPanel(panelRef.current), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const total = Number(f.totalHours);
    if (!f.date || !Number.isFinite(total) || total <= 0) { setErr("A date and a total time are required."); return; }
    setBusy(true);
    setErr(null);
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
      const res = await fetch(initial ? `/api/logbook/entries/${initial.id}` : "/api/logbook/entries", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setErr(issueMessage(await res.json().catch(() => null), "Couldn't save that flight.", FIELD_LABELS));
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
    setErr(null);
    try {
      const res = await fetch(`/api/logbook/entries/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        setErr(issueMessage(await res.json().catch(() => null), "Couldn't delete that flight. Please try again."));
        return;
      }
      onDone();
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={panelRef} aria-labelledby="flight-form-h" className={`${cardCls} scroll-mt-28 border border-gold/40`}>
      <h2 id="flight-form-h" className="font-display text-2xl text-ivory">{isEdit ? "Edit flight" : "Add a flight"}</h2>
      {initial?.source === "PLATFORM" && <p className="mt-1 text-sm text-slate-tac">Lumiritin flight — adjust the hour split.</p>}
      {initial?.external && (
        <Alert tone="info" className="mt-4">
          This flight comes from MyFlightbook, so changes made here are replaced on the next sync. Edit it in MyFlightbook instead.
        </Alert>
      )}

      <form onSubmit={submit} noValidate>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Date" type="date" value={f.date} onChange={set("date")} />
          <TextField label="From (ICAO)" value={f.departureIcao} onChange={set("departureIcao")} placeholder="FALA" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <TextField label="To (ICAO)" value={f.arrivalIcao} onChange={set("arrivalIcao")} placeholder="FACT" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <TextField label="Aircraft type" value={f.aircraftType} onChange={set("aircraftType")} placeholder="PC12" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <TextField label="Registration" value={f.aircraftReg} onChange={set("aircraftReg")} placeholder="ZS-ABC" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <TextField label="Total time *" inputMode="decimal" value={f.totalHours} onChange={set("totalHours")} placeholder="1.5" />
          {NUM_FIELDS.map(([k, label]) => (
            <TextField key={k} label={label} inputMode="decimal" value={f[k]} onChange={set(k)} placeholder="0.0" />
          ))}
          <TextField label="Day landings" inputMode="numeric" value={f.dayLandings} onChange={set("dayLandings")} />
          <TextField label="Night landings" inputMode="numeric" value={f.nightLandings} onChange={set("nightLandings")} />
          <div className="sm:col-span-2">
            <TextField label="Certified by" hint="CFI / PIC sign & licence no." value={f.certifier} onChange={set("certifier")} placeholder="J. Smith 12345" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <TextField label="Remarks" hint="Maneuvers, operations & endorsements" value={f.remarks} onChange={set("remarks")} />
          </div>
        </div>

        <div className="mt-4 empty:hidden"><FormError message={err} /></div>

        {canDelete && (
          <div className="mt-6 border-t border-white/10 pt-4">
            {confirmingDelete ? (
              <div className="rounded-2xl bg-alert/10 p-4">
                <p className="text-sm text-ivory">
                  Delete this flight? It will be removed from your logbook.
                  {initial.external ? " It returns on the next MyFlightbook sync unless you delete it there too." : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className={ghostBtnSm} autoFocus>Keep flight</button>
                  <button type="button" onClick={del} disabled={busy} className={dangerBtn}>{busy ? "Deleting…" : "Delete flight"}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className={dangerTextBtn}>Delete flight</button>
            )}
          </div>
        )}

        <div className={stickyBarCls}>
          <button type="submit" disabled={busy} className={primaryBtnSm}>{busy && !confirmingDelete ? "Saving…" : isEdit ? "Save changes" : "Add flight"}</button>
          <button type="button" onClick={onCancel} disabled={busy} className={ghostBtnSm}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
