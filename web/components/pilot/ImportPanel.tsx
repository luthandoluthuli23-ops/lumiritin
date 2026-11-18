"use client";

import { useRef, useState } from "react";
import { Alert, type Tone } from "@/components/ui/Alert";
import { TextField, cardCls, ghostBtnSm, primaryBtnSm } from "@/components/ui/Field";
import { formatHours, type ImportTotals, type ParsedFlight } from "@/lib/logbook-csv";
import { fileInputCls, hx } from "./logbook-shared";

interface Issue { line: number; reason: string; raw: string }
interface Preview {
  token: string;
  file: { name: string; encoding: string; delimiter: string; dateOrder: string | null };
  columns: { field: string; header: string }[];
  ignoredColumns: string[];
  blankLines: number;
  totals: ImportTotals;
  flights: ParsedFlight[];
  flightsShown: number;
  skipped: Issue[];
  warnings: Issue[];
  duplicatesInFile: { line: number; duplicateOfLine: number; date: string; totalHours: number }[];
  alreadyInLogbook: { line: number; date: string; totalHours: number; existingSource: string }[];
  replacing: { flights: number; totals: ImportTotals } | null;
}

/**
 * Import a logbook export (CSV / tab-separated text) in two steps: Preview shows exactly what will be saved (with
 * totals), every row that won't be and why, and anything worth a look. Nothing is saved until "Import N flights".
 * Paper logbooks go through "Scan your paper logbook" instead, where every row is checked against the photo.
 */
export function ImportPanel({ provider, providerRef, onImported }: { provider: string | null; providerRef: string | null; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prov, setProv] = useState(provider ?? "");
  const [ref, setRef] = useState(providerRef ?? "");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [keepDuplicates, setKeepDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  function form(step: "preview" | "confirm", opts = { mode, keepDuplicates }) {
    const file = inputRef.current?.files?.[0];
    if (!file) return null;
    const body = new FormData();
    body.append("file", file);
    body.append("step", step);
    body.append("mode", opts.mode);
    if (opts.keepDuplicates) body.append("keepDuplicates", "1");
    if (prov.trim()) body.append("provider", prov.trim());
    if (ref.trim()) body.append("ref", ref.trim());
    if (step === "confirm" && preview) body.append("token", preview.token);
    return body;
  }

  async function runPreview(opts = { mode, keepDuplicates }) {
    const body = form("preview", opts);
    if (!body) return setNotice({ tone: "warn", text: "Choose your logbook export (CSV) first." });
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/logbook/import", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        setPreview(null);
        return setNotice({ tone: "err", text: d?.message ?? "Couldn't read that file." });
      }
      setPreview(d as Preview);
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const body = form("confirm");
    if (!body || !preview) return;
    setBusy(true);
    try {
      const res = await fetch("/api/logbook/import", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) return setNotice({ tone: "err", text: d?.message ?? "Couldn't import. Nothing was saved." });
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      setNotice({ tone: "ok", text: `Imported ${d.saved} flight${d.saved === 1 ? "" : "s"} (${formatHours(d.totals.hours.totalHours)})${d.removed ? `, after removing ${d.removed} from your previous import` : ""}.` });
      onImported();
    } catch {
      setNotice({ tone: "err", text: "Network error. Nothing was saved; please try again." });
    } finally {
      setBusy(false);
    }
  }

  const change = (next: { mode: "add" | "replace"; keepDuplicates: boolean }) => {
    setMode(next.mode);
    setKeepDuplicates(next.keepDuplicates);
    if (preview) void runPreview(next); // the preview always matches the options that will be used
  };

  const t = preview?.totals;
  return (
    <section aria-labelledby="import-h" className={cardCls}>
      <h2 id="import-h" className="font-display text-2xl text-ivory">Import a logbook export</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Export a <strong className="font-semibold text-ivory">CSV</strong> from ForeFlight, LogTen, MyFlightbook, Excel or any logbook. You&apos;ll see a
        preview with totals, and every row that won&apos;t be imported and why, before anything is saved. Decimal hours (1.5) and hh:mm (1:30) both work.
      </p>
      <p className="mt-2 text-sm text-slate-tac">
        Export tips: <span className="text-ivory">ForeFlight</span> → More · Logbook · Export; <span className="text-ivory">LogTen</span> → File · Export · CSV;{" "}
        <span className="text-ivory">MyFlightbook</span> → website · Logbook · Export.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextField label="Which logbook? (optional)" value={prov} onChange={(e) => setProv(e.target.value)} placeholder="ForeFlight" />
        <TextField label="Your handle / number there (optional)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="for your reference" />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref={inputRef} type="file" aria-label="Your logbook export" accept=".csv,.txt,.tsv,text/csv,text/plain,application/vnd.ms-excel" onChange={() => setPreview(null)} className={fileInputCls} />
        <button type="button" onClick={() => runPreview()} disabled={busy} className={`${ghostBtnSm} w-full shrink-0 sm:w-auto`}>
          {busy && !preview ? "Reading…" : "Preview"}
        </button>
      </div>
      {notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>}

      {preview && t && (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl border border-gold/40 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-tac">Will be imported</p>
            <p className="mt-1 font-display text-3xl text-ivory">
              {t.flights} flight{t.flights === 1 ? "" : "s"} · {formatHours(t.hours.totalHours)}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {([["PIC", t.hours.picHours], ["Co-pilot", t.hours.coPilotHours], ["Dual", t.hours.dualHours], ["Night", t.hours.nightHours], ["Instrument", t.hours.instrumentHours], ["Multi-engine", t.hours.multiEngineHours]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt className="text-slate-tac">{k}</dt><dd className="tabular-nums text-ivory">{hx(v)}</dd></div>
              ))}
              <div className="flex justify-between gap-2"><dt className="text-slate-tac">Day landings</dt><dd className="tabular-nums text-ivory">{t.dayLandings}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-tac">Night landings</dt><dd className="tabular-nums text-ivory">{t.nightLandings}</dd></div>
            </dl>
            {t.firstDate && (
              <p className="mt-2 text-xs text-slate-tac">
                {t.firstDate} to {t.lastDate} · file read as {preview.file.encoding}, “{preview.file.delimiter}” separated
                {preview.file.dateOrder ? `, dates ${preview.file.dateOrder === "DMY" ? "day/month" : "month/day"}` : ""}
              </p>
            )}
          </div>

          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-xs uppercase tracking-widest text-slate-tac">Options</legend>
            <label className="flex items-start gap-3 pointer-coarse:min-h-11">
              <input type="radio" name="mode" checked={mode === "add"} onChange={() => change({ mode: "add", keepDuplicates })} className="mt-1 accent-[#d4af37]" />
              <span className="text-ivory">Add to my logbook <span className="text-slate-tac">(keeps everything already there)</span></span>
            </label>
            <label className="flex items-start gap-3 pointer-coarse:min-h-11">
              <input type="radio" name="mode" checked={mode === "replace"} onChange={() => change({ mode: "replace", keepDuplicates })} className="mt-1 accent-[#d4af37]" />
              <span className="text-ivory">Replace my previous CSV import <span className="text-slate-tac">(flights you added by hand, Lumiritin flights and MyFlightbook flights are kept)</span></span>
            </label>
            <label className="flex items-start gap-3 pointer-coarse:min-h-11">
              <input type="checkbox" checked={keepDuplicates} onChange={(e) => change({ mode, keepDuplicates: e.target.checked })} className="mt-1 accent-[#d4af37]" />
              <span className="text-ivory">Import duplicate rows anyway</span>
            </label>
          </fieldset>

          {preview.replacing && preview.replacing.flights > 0 && (
            <Alert tone="warn">This will first remove {preview.replacing.flights} flight{preview.replacing.flights === 1 ? "" : "s"} ({formatHours(preview.replacing.totals.hours.totalHours)}) from your previous import.</Alert>
          )}

          <IssueList
            title="Not imported"
            tone="err"
            empty="Every row with a flight on it will be imported."
            items={[
              ...preview.skipped.map((s) => ({ line: s.line, text: s.reason, raw: s.raw })),
              ...preview.alreadyInLogbook.map((d) => ({ line: d.line, text: `Already in your logbook (${d.existingSource}): ${d.date}, ${hx(d.totalHours)} h`, raw: "" })),
              ...preview.duplicatesInFile.map((d) => ({ line: d.line, text: `Same as line ${d.duplicateOfLine}: ${d.date}, ${hx(d.totalHours)} h`, raw: "" })),
            ]}
          />
          <IssueList title="Worth a look (imported exactly as in your file)" tone="warn" items={preview.warnings.map((w) => ({ line: w.line, text: w.reason, raw: w.raw }))} />
          {(preview.ignoredColumns.length > 0 || preview.blankLines > 0) && (
            <p className="text-xs text-slate-tac">
              {preview.ignoredColumns.length > 0 && <>Columns not imported: {preview.ignoredColumns.join(", ")}. </>}
              {preview.blankLines > 0 && <>{preview.blankLines} blank line{preview.blankLines === 1 ? "" : "s"} ignored.</>}
            </p>
          )}

          <details className="rounded-2xl border border-white/10 p-3 text-sm">
            <summary className="cursor-pointer text-ivory pointer-coarse:min-h-11">See the flights ({preview.flightsShown}{t.flights > preview.flightsShown ? ` of ${t.flights}` : ""})</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead className="text-xs uppercase text-slate-tac">
                  <tr><th className="py-1 pr-3">Line</th><th className="pr-3">Date</th><th className="pr-3">Route</th><th className="pr-3">Reg</th><th className="pr-3 text-right">Total</th><th className="pr-3 text-right">PIC</th><th className="text-right">Night</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-ivory/90">
                  {preview.flights.map((f) => (
                    <tr key={f.line}>
                      <td className="py-1 pr-3 text-slate-tac">{f.line}</td>
                      <td className="pr-3">{f.date}</td>
                      <td className="pr-3">{[f.departureIcao, f.arrivalIcao].filter(Boolean).join(" → ") || "—"}</td>
                      <td className="pr-3">{f.aircraftReg ?? "—"}</td>
                      <td className="pr-3 text-right tabular-nums">{hx(f.totalHours)}</td>
                      <td className="pr-3 text-right tabular-nums">{f.picHours == null ? "—" : hx(f.picHours)}</td>
                      <td className="text-right tabular-nums">{f.nightHours == null ? "—" : hx(f.nightHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={confirm} disabled={busy || t.flights === 0} className={primaryBtnSm}>
              {busy ? "Working…" : `Import ${t.flights} flight${t.flights === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={() => setPreview(null)} className={ghostBtnSm}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function IssueList({ title, tone, items, empty }: { title: string; tone: "err" | "warn"; items: { line: number; text: string; raw: string }[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-sm text-emerald-status">{empty}</p> : null;
  return (
    <div>
      <p className={`text-sm font-semibold ${tone === "err" ? "text-alert" : "text-warn"}`}>{title}: {items.length}</p>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
        {[...items].sort((a, b) => a.line - b.line).map((i, n) => (
          <li key={`${i.line}-${n}`} className="rounded-lg bg-white/5 px-3 py-2">
            <span className="text-slate-tac">Line {i.line}:</span> <span className="text-ivory">{i.text}</span>
            {i.raw && <span className="mt-0.5 block break-all font-mono text-xs text-slate-tac">{i.raw}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
