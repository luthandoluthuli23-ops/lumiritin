"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, type Tone } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { cardCls, ghostBtn, ghostBtnSm, primaryBtn, rowCardCls } from "@/components/ui/Field";
import type { MfbStatus } from "@/lib/logbook-sync";
import { FlightForm } from "./FlightForm";
import { ImportPanel } from "./ImportPanel";
import { MyFlightbookPanel } from "./MyFlightbookPanel";
import { ScanToFillPanel } from "./ScanToFillPanel";
import { formatDate } from "./format";
import { h1, type LogbookEntryDTO } from "./logbook-shared";

export type { LogbookEntryDTO } from "./logbook-shared";

type Hours = Record<"totalHours" | "picHours" | "nightHours" | "instrumentHours" | "multiEngineHours" | "turbineHours", number>;

interface Props {
  entries: LogbookEntryDTO[];
  totals: { grand: Hours; broughtForward: Hours; logged: Hours; entryCount: number; lastFlight: string | null };
  provider: string | null;
  providerRef: string | null;
  broughtForwardHours: number;
  lumiLive: boolean;
  /** Whether the site has the MyFlightbook connection configured. */
  myFlightbookLive: boolean;
  /** The pilot's MyFlightbook connection, or null when not connected. */
  mfb: MfbStatus | null;
  flash: { tone: Tone; text: string } | null;
}

const LOGBOOK_PATH = "/wallet/logbook";

export function LogbookClient({ entries, totals, provider, providerRef, broughtForwardHours, lumiLive, myFlightbookLive, mfb, flash }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<LogbookEntryDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);

  // The connect result arrives in the URL. Keep it on screen, but take it out of the address bar so a refresh doesn't replay it.
  const [shownFlash] = useState(flash);
  useEffect(() => {
    if (shownFlash) router.replace(LOGBOOK_PATH, { scroll: false });
  }, [shownFlash, router]);

  const edit = (e: LogbookEntryDTO) => { setEditing(e); setAdding(false); setScanning(false); };

  return (
    <div className="mt-8 space-y-6">
      {shownFlash && <Alert tone={shownFlash.tone}>{shownFlash.text}</Alert>}

      {/* Grand total + category breakdown */}
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className={`${cardCls} col-span-2 border border-gold/40 sm:col-span-1`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-tac">Total time</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-display text-4xl text-gold-gradient sm:text-5xl">{h1(totals.grand.totalHours)}</span>
            <span className="text-base text-slate-tac">hrs</span>
          </p>
          <p className="mt-1 text-xs text-slate-tac">
            {h1(totals.logged.totalHours)} logged here{broughtForwardHours > 0 ? ` · ${h1(broughtForwardHours)} brought forward` : ""}
          </p>
        </div>
        <Stat label="Pilot-in-command" value={totals.grand.picHours} />
        <Stat label="Night" value={totals.grand.nightHours} />
        <Stat label="Instrument" value={totals.grand.instrumentHours} />
        <Stat label="Multi-engine" value={totals.grand.multiEngineHours} />
        <Stat label="Turbine" value={totals.grand.turbineHours} className="last:col-span-2 sm:last:col-span-1" />
      </section>

      {/* Add actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={() => { setAdding((v) => !v); setEditing(null); setScanning(false); }} className={primaryBtn}>
          {adding ? "Close" : "+ Add a flight"}
        </button>
        {lumiLive && (
          <button type="button" onClick={() => { setScanning((v) => !v); setAdding(false); setEditing(null); }} className={ghostBtn}>
            {scanning ? "Close" : "Scan a page to fill in"}
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

      <MyFlightbookPanel live={myFlightbookLive} mfb={mfb} />

      <ImportPanel provider={provider} providerRef={providerRef} lumiLive={lumiLive} onImported={() => router.refresh()} />

      {/* Entries */}
      <section aria-labelledby="flights-h" className="pt-4">
        <h2 id="flights-h" className="mb-4 font-display text-3xl text-ivory">
          Flights {totals.entryCount > 0 && <span className="text-slate-tac">({totals.entryCount})</span>}
        </h2>
        {entries.length === 0 ? (
          <EmptyState title="No flights yet">
            Fly a job through Lumiritin and it appears here automatically — or import your existing logbook or add a flight above.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {entries.map((e) => <FlightCard key={e.id} e={e} onEdit={() => edit(e)} />)}
            </ul>
            <FlightTable entries={entries} onEdit={edit} />
          </>
        )}
      </section>

      <p className="text-xs text-slate-tac">
        Hours you fly through Lumiritin are logged automatically and witnessed by the booking operator. Imported and
        manual flights are self-declared. Currency is based on the landings you&apos;ve logged.
      </p>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className={`${rowCardCls} ${className}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-tac">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-display text-3xl text-gold-gradient">{h1(value)}</span>
        <span className="text-sm text-slate-tac">hrs</span>
      </p>
    </div>
  );
}

/** Where a flight came from. Rows pulled from MyFlightbook are refreshed on every sync, so they get their own badge. */
function SourcePill({ e }: { e: LogbookEntryDTO }) {
  if (e.external) return <Pill tone="gold" className="whitespace-nowrap">MyFlightbook</Pill>;
  if (e.source === "PLATFORM") return <Pill tone="ok" className="whitespace-nowrap">Lumiritin · verified</Pill>;
  return <Pill className="whitespace-nowrap">{e.source === "IMPORTED" ? "Imported" : "Manual"}</Pill>;
}

const route = (e: LogbookEntryDTO) => [e.departureIcao, e.arrivalIcao].filter(Boolean).join(" → ") || "—";
const aircraft = (e: LogbookEntryDTO) => [e.aircraftType, e.aircraftReg].filter(Boolean).join(" · ") || "—";
const landings = (e: LogbookEntryDTO) => e.dayLandings + e.nightLandings;
const hrs = (v: number | null) => (v != null ? h1(v) : "—");

// ─── Phones: one card per flight ─────────────────────────────────────────────

function FlightCard({ e, onEdit }: { e: LogbookEntryDTO; onEdit: () => void }) {
  return (
    <li className={rowCardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-tac">{formatDate(e.date)}</p>
          <p className="mt-0.5 break-words font-display text-xl text-ivory">{route(e)}</p>
          <p className="mt-0.5 break-words text-sm text-slate-tac">{aircraft(e)}</p>
          {e.operatorName && <p className="break-words text-sm text-slate-tac">{e.operatorName}</p>}
        </div>
        <p className="shrink-0 text-right">
          <span className="font-display text-3xl text-gold-gradient">{h1(e.totalHours)}</span>
          <span className="block text-xs text-slate-tac">hrs</span>
        </p>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Meta label="Landings" value={landings(e) || "—"} />
        <Meta label="PIC" value={hrs(e.picHours)} />
        <Meta label="Night" value={hrs(e.nightHours)} />
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <SourcePill e={e} />
        <button type="button" onClick={onEdit} aria-label={`Edit flight ${route(e)} on ${formatDate(e.date)}`} className={ghostBtnSm}>Edit</button>
      </div>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-slate-tac">{label}</dt>
      <dd className="tabular-nums text-ivory">{value}</dd>
    </div>
  );
}

// ─── Tablets and desktop: the full logbook table ─────────────────────────────

function FlightTable({ entries, onEdit }: { entries: LogbookEntryDTO[]; onEdit: (e: LogbookEntryDTO) => void }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-tac">
          <tr>
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Route</th>
            <th className="px-3 py-2.5">Aircraft</th>
            <th className="px-3 py-2.5 text-right">Total</th>
            <th className="px-3 py-2.5 text-right">PIC</th>
            <th className="px-3 py-2.5 text-right">Co-pilot</th>
            <th className="px-3 py-2.5 text-right">Dual</th>
            <th className="px-3 py-2.5 text-right">Instructor</th>
            <th className="px-3 py-2.5 text-right">Night</th>
            <th className="px-3 py-2.5 text-right">Instrument</th>
            <th className="px-3 py-2.5 text-right">Landings</th>
            <th className="px-3 py-2.5">Certified by</th>
            <th className="px-3 py-2.5">Source</th>
            <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {entries.map((e) => (
            <tr key={e.id} className="text-ivory/90">
              <td className="whitespace-nowrap px-3 py-2.5">{formatDate(e.date)}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{route(e)}</td>
              <td className="px-3 py-2.5">{aircraft(e)}{e.operatorName ? <span className="block text-xs text-slate-tac">{e.operatorName}</span> : null}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{h1(e.totalHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.picHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.coPilotHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.dualHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.instructorHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.nightHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{hrs(e.instrumentHours)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-tac">{landings(e) || "—"}</td>
              <td className="px-3 py-2.5 text-slate-tac">{e.certifier || "—"}</td>
              <td className="px-3 py-2.5"><SourcePill e={e} /></td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <button type="button" onClick={() => onEdit(e)} aria-label={`Edit flight ${route(e)} on ${formatDate(e.date)}`} className={ghostBtnSm}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
