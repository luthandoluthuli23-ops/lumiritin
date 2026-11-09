"use client";

import { useRef, useState } from "react";
import { Alert, type Tone } from "@/components/ui/Alert";
import { TextField, cardCls, ghostBtnSm } from "@/components/ui/Field";
import { fileInputCls, h1 } from "./logbook-shared";

/** One-time import of an existing logbook: a CSV export (parsed exactly) or, when Lumi is on, a PDF / photos. */
export function ImportPanel({ provider, providerRef, lumiLive, onImported }: { provider: string | null; providerRef: string | null; lumiLive: boolean; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prov, setProv] = useState(provider ?? "");
  const [ref, setRef] = useState(providerRef ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setNotice({ tone: "warn", text: "Choose your logbook file first — a CSV export, or a PDF/photo." }); return; }
    setBusy(true); setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (prov.trim()) body.append("provider", prov.trim());
      if (ref.trim()) body.append("ref", ref.trim());
      const res = await fetch("/api/logbook/import", { method: "POST", body });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) { setNotice({ tone: "err", text: d?.message ?? "Couldn't import that file." }); return; }
      if (d.mode === "csv") {
        setNotice({ tone: "ok", text: `Imported ${d.imported} flight${d.imported === 1 ? "" : "s"}${d.skipped ? ` (${d.skipped} row${d.skipped === 1 ? "" : "s"} skipped)` : ""}.` });
      } else if (d.mode === "lumi-flights") {
        setNotice({ tone: "ok", text: `Lumi read ${d.imported} flight${d.imported === 1 ? "" : "s"} off your logbook and added them.` });
      } else {
        setNotice({ tone: "ok", text: `Lumi read ${h1(d.totalHours)} total hours and set them as your brought-forward balance.` });
      }
      onImported();
    } catch {
      setNotice({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="import-h" className={cardCls}>
      <h2 id="import-h" className="font-display text-2xl text-ivory">Or upload it — once</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Export a <strong className="font-semibold text-ivory">CSV</strong> from ForeFlight, LogTen, MyFlightbook or any logbook (parsed exactly, flight by flight)
        {lumiLive ? ", or just upload a PDF or photos of your logbook pages and Lumi reads each flight off them" : ""}.
        After this, flights you fly through Lumiritin keep logging themselves.
      </p>
      <p className="mt-2 text-sm text-slate-tac">
        <strong className="font-semibold text-ivory">On ForeFlight, LogTen or Garmin?</strong> They don&apos;t allow a direct pull, so the fastest route is a one-time
        export — a CSV, or just snap your logbook pages and let Lumi read them. Export tips: <span className="text-ivory">ForeFlight</span> → More ·
        Logbook · Export; <span className="text-ivory">LogTen</span> → File · Export · CSV; <span className="text-ivory">MyFlightbook</span> → website · Logbook · Export.
      </p>
      {lumiLive && <p className="mt-2 text-sm text-slate-tac">PDFs and photos are sent to our AI provider (Anthropic) to be read and are not stored by Lumiritin.</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextField label="Which logbook? (optional)" value={prov} onChange={(e) => setProv(e.target.value)} placeholder="ForeFlight" />
        <TextField label="Your handle / number there (optional)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="for your reference" />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          aria-label="Your logbook file"
          accept={lumiLive ? ".csv,text/csv,application/vnd.ms-excel,application/pdf,image/jpeg,image/png,image/webp" : ".csv,text/csv,application/vnd.ms-excel"}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className={fileInputCls}
        />
        <button type="button" onClick={submit} disabled={busy} className={`${ghostBtnSm} w-full shrink-0 sm:w-auto`}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {fileName && !notice && <p className="mt-2 break-words text-sm text-slate-tac">Selected: {fileName}</p>}
      {notice && <Alert tone={notice.tone} className="mt-4">{notice.text}</Alert>}
    </section>
  );
}
