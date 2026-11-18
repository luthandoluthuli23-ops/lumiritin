"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Alert, type Tone } from "@/components/ui/Alert";
import { cardCls, dangerTextBtn, ghostBtnSm, inputSmCls, primaryBtnSm } from "@/components/ui/Field";
import { formatHours, parseDuration } from "@/lib/logbook-csv";
import { SmField, fileInputCls, scrollToPanel, stickyBarCls } from "./logbook-shared";

// Scan a paper logbook: photos/PDFs of any number of pages → Lumi reads every row → the pilot checks each block against
// the original photo (shown beside the rows), corrects anything misread, then saves. Nothing is stored until they do,
// and nothing is dropped silently: Save stays off until every row is valid or deliberately removed.

const HOURS = [
  ["totalHours", "Total *"],
  ["picHours", "PIC"],
  ["coPilotHours", "Co-pilot"],
  ["dualHours", "Dual"],
  ["instructorHours", "Instructor"],
  ["nightHours", "Night"],
  ["instrumentHours", "Instrument"],
  ["multiEngineHours", "Multi-engine"],
  ["turbineHours", "Turbine"],
] as const;
type HourKey = (typeof HOURS)[number][0];

type DraftRow = {
  key: number;
  pageId: number;
  date: string; departureIcao: string; arrivalIcao: string; aircraftType: string; aircraftReg: string;
  totalHours: string; picHours: string; coPilotHours: string; dualHours: string; instructorHours: string;
  nightHours: string; instrumentHours: string; multiEngineHours: string; turbineHours: string;
  dayLandings: string; nightLandings: string; certifier: string; remarks: string;
};
type Field = Exclude<keyof DraftRow, "key" | "pageId">;

interface Page {
  id: number;
  name: string;
  /** Object URL of the photo, to show beside its rows (PDFs have none). */
  url: string | null;
  status: "queued" | "reading" | "done" | "error";
  error?: string;
  /** A totals / brought-forward line Lumi saw on the page. */
  pageTotal: number | null;
}

const s = (v: unknown): string => (v == null ? "" : String(v));
let nextKey = 1;
function toDraft(r: Record<string, unknown>, pageId: number): DraftRow {
  return {
    key: nextKey++, pageId,
    date: s(r.date), departureIcao: s(r.departureIcao), arrivalIcao: s(r.arrivalIcao), aircraftType: s(r.aircraftType), aircraftReg: s(r.aircraftReg),
    totalHours: s(r.totalHours), picHours: s(r.picHours), coPilotHours: s(r.coPilotHours), dualHours: s(r.dualHours), instructorHours: s(r.instructorHours),
    nightHours: s(r.nightHours), instrumentHours: s(r.instrumentHours), multiEngineHours: s(r.multiEngineHours), turbineHours: s(r.turbineHours),
    dayLandings: s(r.dayLandings ?? ""), nightLandings: s(r.nightLandings ?? ""), certifier: s(r.certifier), remarks: s(r.remarks),
  };
}
const blankRow = (pageId: number): DraftRow => toDraft({}, pageId);

const today = () => new Date().toISOString().slice(0, 10);
const hoursOf = (v: string): number | null => {
  const d = parseDuration(v, true);
  return "error" in d ? null : d.hours;
};

/** Problems per cell (no errors = the row is ready). Warnings don't block saving. */
function check(r: DraftRow): { errors: Partial<Record<Field, string>>; warnings: Partial<Record<Field, string>> } {
  const errors: Partial<Record<Field, string>> = {};
  const warnings: Partial<Record<Field, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.date = "Date needed";
  else if (r.date > today()) errors.date = "In the future";
  for (const [k] of HOURS) {
    const d = parseDuration(r[k], true);
    if ("error" in d) errors[k] = "Use 1.5 or 1:30";
  }
  const total = hoursOf(r.totalHours);
  if (!errors.totalHours && (total === null || total <= 0)) errors.totalHours = "Total needed";
  for (const [k] of HOURS) {
    if (k === "totalHours" || errors[k]) continue;
    const v = hoursOf(r[k]);
    if (v !== null && total !== null && v > total) warnings[k] = "More than total";
  }
  for (const k of ["dayLandings", "nightLandings"] as const) if (r[k].trim() && !/^\d{1,2}$/.test(r[k].trim())) errors[k] = "Whole number";
  for (const k of ["departureIcao", "arrivalIcao"] as const) if (r[k].trim() && !/^[A-Za-z0-9]{3,4}$/.test(r[k].trim())) warnings[k] = "Check code";
  return { errors, warnings };
}

/** Photos are redrawn at most 2400 px on the long edge (legible, and under the 4 MB upload limit). */
async function prepare(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size <= 1.5 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return (await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88))) ?? file;
}

const sumHours = (rows: DraftRow[]) => Math.round(rows.reduce((t, r) => t + (hoursOf(r.totalHours) ?? 0) * 10_000, 0)) / 10_000;

export function ScanToFillPanel({ onSaved }: { onSaved: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ hours: string; asOf: string } | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => scrollToPanel(panelRef.current), []);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function readPages() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return setNotice({ tone: "warn", text: "Choose photos or a PDF of your logbook pages first." });
    setReading(true);
    setNotice(null);
    const start = pages.length ? Math.max(...pages.map((p) => p.id)) + 1 : 1;
    const added: Page[] = files.map((f, i) => {
      const url = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
      if (url) urls.current.push(url);
      return { id: start + i, name: f.name, url, status: "queued", pageTotal: null };
    });
    setPages((p) => [...p, ...added]);
    for (const [i, file] of files.entries()) {
      const page = added[i];
      setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, status: "reading" } : p)));
      try {
        const body = new FormData();
        body.append("file", await prepare(file), file.name);
        const res = await fetch("/api/logbook/scan", { method: "POST", body });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.ok) throw new Error(d?.message ?? "Couldn't read this page.");
        setRows((rs) => [...rs, ...(d.flights as Record<string, unknown>[]).map((r) => toDraft(r, page.id))]);
        setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, status: "done", pageTotal: typeof d.pageTotal === "number" ? d.pageTotal : null } : p)));
        if (d.flights.length === 0 && typeof d.pageTotal === "number") setOpening({ hours: String(d.pageTotal), asOf: today() });
      } catch (e) {
        setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, status: "error", error: (e as Error).message } : p)));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    setReading(false);
    setNotice({ tone: "info", text: "Check every row against the photo beside it. Tap a box to correct it; problems are highlighted." });
  }

  const setCell = (key: number, f: Field) => (e: ChangeEvent<HTMLInputElement>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [f]: e.target.value } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const addRow = (pageId: number) => setRows((rs) => [...rs, blankRow(pageId)]);

  const checks = useMemo(() => new Map(rows.map((r) => [r.key, check(r)])), [rows]);
  const badRows = rows.filter((r) => Object.keys(checks.get(r.key)!.errors).length > 0).length;
  const total = sumHours(rows);

  async function save() {
    if (rows.length === 0 || badRows > 0) return;
    setSaving(true);
    setNotice(null);
    const num = (v: string) => hoursOf(v) ?? undefined;
    const flights = rows.map((r) => ({
      date: r.date,
      departureIcao: r.departureIcao.trim() || undefined,
      arrivalIcao: r.arrivalIcao.trim() || undefined,
      aircraftType: r.aircraftType.trim() || undefined,
      aircraftReg: r.aircraftReg.trim() || undefined,
      totalHours: hoursOf(r.totalHours)!,
      ...Object.fromEntries(HOURS.filter(([k]) => k !== "totalHours").map(([k]) => [k, num(r[k as HourKey])])),
      dayLandings: r.dayLandings.trim() ? Number(r.dayLandings) : undefined,
      nightLandings: r.nightLandings.trim() ? Number(r.nightLandings) : undefined,
      certifier: r.certifier.trim() || undefined,
      remarks: r.remarks.trim() || undefined,
    }));
    let saved = 0;
    try {
      for (let i = 0; i < flights.length; i += 100) {
        const res = await fetch("/api/logbook/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flights: flights.slice(i, i + 100) }) });
        const d = await res.json().catch(() => null);
        if (!res.ok) {
          const issue = d?.issues?.[0];
          throw new Error(issue ? `${issue.message} (${issue.path})` : d?.message ?? "Couldn't save those flights.");
        }
        saved = Math.min(flights.length, i + 100);
      }
      onSaved();
    } catch (e) {
      // Saved batches are already in the logbook; drop them from the review so they aren't saved twice.
      if (saved > 0) setRows((rs) => rs.slice(saved));
      setNotice({ tone: "err", text: `${saved ? `${saved} flight${saved === 1 ? " was" : "s were"} saved. ` : ""}The rest weren't: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }

  async function saveOpening() {
    if (!opening) return;
    const hours = hoursOf(opening.hours);
    if (hours === null || hours <= 0) return setNotice({ tone: "warn", text: "Enter the brought-forward hours (e.g. 1234.5 or 1234:30)." });
    const res = await fetch("/api/logbook/opening-balance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ totalHours: hours, asOf: opening.asOf }) });
    if (!res.ok) return setNotice({ tone: "err", text: "Couldn't save the opening balance. Check the date and hours." });
    setOpening(null);
    setNotice({ tone: "ok", text: `Opening balance set to ${formatHours(hours)}.` });
  }

  return (
    <section ref={panelRef} aria-labelledby="scan-h" className={`${cardCls} scroll-mt-28 border border-gold/40`}>
      <h2 id="scan-h" className="font-display text-2xl text-ivory">Scan your paper logbook</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Photograph every page (or upload a PDF). Lumi reads each flight; you check every box against the photo beside it and
        correct anything it misread. Nothing is saved until you press Save.
      </p>
      <p className="mt-2 text-sm text-slate-tac">Pages are sent to our AI provider (Anthropic) to be read and are not stored by Lumiritin.</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref={inputRef} type="file" multiple aria-label="Photos or PDF of your logbook pages" accept="application/pdf,image/jpeg,image/png,image/webp" className={fileInputCls} />
        <button type="button" onClick={readPages} disabled={reading || saving} className={`${primaryBtnSm} w-full shrink-0 sm:w-auto`}>
          {reading ? "Reading…" : pages.length ? "Read more pages" : "Read pages"}
        </button>
      </div>
      {notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>}

      {opening && (
        <div className="mt-5 rounded-2xl border border-gold/40 p-4">
          <p className="text-sm text-ivory">This page looks like a brought-forward total. Use it as your opening balance (the hours before your first logged flight)?</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <SmField label="Brought-forward hours"><input inputMode="decimal" value={opening.hours} onChange={(e) => setOpening({ ...opening, hours: e.target.value })} className={inputSmCls} /></SmField>
            <SmField label="As of"><input type="date" value={opening.asOf} max={today()} onChange={(e) => setOpening({ ...opening, asOf: e.target.value })} className={inputSmCls} /></SmField>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveOpening} className={primaryBtnSm}>Use as opening balance</button>
              <button type="button" onClick={() => setOpening(null)} className={ghostBtnSm}>No</button>
            </div>
          </div>
        </div>
      )}

      {pages.map((page) => {
        const pageRows = rows.filter((r) => r.pageId === page.id);
        const sum = sumHours(pageRows);
        const mismatch = page.pageTotal !== null && pageRows.length > 0 && Math.abs(page.pageTotal - sum) > 0.05;
        return (
          <div key={page.id} className="mt-6 rounded-2xl border border-white/10 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="break-all text-sm text-ivory">
                Page {page.id} <span className="text-slate-tac">· {page.name}</span>
                {page.status === "reading" && <span className="ml-2 text-gold-light">reading…</span>}
                {page.status === "queued" && <span className="ml-2 text-slate-tac">waiting</span>}
              </p>
              {page.status === "done" && <button type="button" onClick={() => addRow(page.id)} className={ghostBtnSm}>+ Add a row Lumi missed</button>}
            </div>
            {page.status === "error" && <Alert tone="err" className="mt-3">{page.error} Try a sharper, well-lit photo of this page.</Alert>}
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              {page.url && (
                <button type="button" onClick={() => setZoom(page.url)} className="self-start overflow-hidden rounded-xl border border-white/10" aria-label={`Show page ${page.id} full size`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.url} alt={`Logbook page ${page.id}`} className="max-h-[28rem] w-full object-contain" />
                </button>
              )}
              <div className={`space-y-3 ${page.url ? "" : "lg:col-span-2"}`}>
                {page.status === "done" && (
                  <p className={`text-xs ${mismatch ? "text-warn" : "text-slate-tac"}`}>
                    {pageRows.length} row{pageRows.length === 1 ? "" : "s"} · total {formatHours(sum)}
                    {page.pageTotal !== null && ` · totals line on the page: ${formatHours(page.pageTotal)}`}
                    {mismatch && " — these differ: check the rows (or it may be a brought-forward total)."}
                  </p>
                )}
                {pageRows.map((r, i) => (
                  <RowEditor key={r.key} index={i + 1} row={r} problems={checks.get(r.key)!} setCell={setCell} onRemove={() => removeRow(r.key)} />
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <div className={stickyBarCls}>
          <p className="text-sm text-slate-tac">
            <span className="text-ivory">{rows.length} flight{rows.length === 1 ? "" : "s"} · {formatHours(total)}</span>
            {badRows > 0 && <span className="ml-2 text-warn">{badRows} row{badRows === 1 ? "" : "s"} to fix or remove before saving</span>}
          </p>
          <button type="button" onClick={save} disabled={saving || reading || badRows > 0} className={primaryBtnSm}>
            {saving ? "Saving…" : `Save ${rows.length} flight${rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {zoom && (
        <div role="dialog" aria-label="Logbook page" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Logbook page, full size" className="max-h-full max-w-full object-contain" />
          <button type="button" className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 px-4 py-2 text-ivory pointer-coarse:min-h-11">Close</button>
        </div>
      )}
    </section>
  );
}

function RowEditor({ index, row: r, problems, setCell, onRemove }: {
  index: number;
  row: DraftRow;
  problems: ReturnType<typeof check>;
  setCell: (key: number, f: Field) => (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const bad = Object.keys(problems.errors).length > 0;
  const cell = (f: Field) => {
    const err = problems.errors[f];
    const warn = problems.warnings[f];
    return {
      className: `${inputSmCls} ${err ? "border-alert/70 bg-alert/10" : warn ? "border-warn/60" : ""}`,
      "aria-invalid": err ? true : undefined,
      title: err ?? warn ?? undefined,
      value: r[f],
      onChange: setCell(r.key, f),
    };
  };
  const note = (f: Field) =>
    problems.errors[f] ?? problems.warnings[f] ? <span className={`mt-0.5 block text-[11px] ${problems.errors[f] ? "text-alert" : "text-warn"}`}>{problems.errors[f] ?? problems.warnings[f]}</span> : null;
  const text = { autoCapitalize: "characters", autoCorrect: "off", spellCheck: false } as const;
  return (
    <div className={`rounded-2xl p-3 ${bad ? "border border-alert/40 bg-alert/5" : "bg-white/5"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-widest text-slate-tac">Row {index}</p>
        <button type="button" onClick={onRemove} className={dangerTextBtn}>Remove</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <SmField label="Date *"><input type="date" {...cell("date")} />{note("date")}</SmField>
        <SmField label="From"><input {...cell("departureIcao")} {...text} />{note("departureIcao")}</SmField>
        <SmField label="To"><input {...cell("arrivalIcao")} {...text} />{note("arrivalIcao")}</SmField>
        <SmField label="Type"><input {...cell("aircraftType")} {...text} /></SmField>
        <SmField label="Registration"><input {...cell("aircraftReg")} {...text} /></SmField>
        <SmField label="Certified by"><input {...cell("certifier")} /></SmField>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
        {HOURS.map(([k, label]) => (
          <SmField key={k} label={label}><input inputMode="decimal" {...cell(k)} />{note(k)}</SmField>
        ))}
        <SmField label="Day ldg"><input inputMode="numeric" {...cell("dayLandings")} />{note("dayLandings")}</SmField>
        <SmField label="Night ldg"><input inputMode="numeric" {...cell("nightLandings")} />{note("nightLandings")}</SmField>
      </div>
      <div className="mt-2">
        <SmField label="Remarks"><input {...cell("remarks")} /></SmField>
      </div>
    </div>
  );
}
