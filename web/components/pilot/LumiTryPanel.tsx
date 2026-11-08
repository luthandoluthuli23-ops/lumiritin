"use client";

import { useRef, useState } from "react";

interface Extracted {
  documentType: string | null;
  isExpectedDocument: boolean;
  licenceNumber: string | null;
  holderName: string | null;
  licenceType: string | null;
  status: string | null;
  issued: string | null;
  expires: string | null;
  ratings: { name: string; expires: string | null }[];
  medical: { class: number | null; expires: string | null } | null;
  aocNumber: string | null;
  approvedTypes: string[];
  totalHours: number | null;
  confidence: number;
  issues: string[];
}

const KINDS = [
  { value: "pilot_licence", label: "Pilot licence" },
  { value: "cabin_crew_licence", label: "Cabin crew licence" },
  { value: "logbook", label: "Pilot logbook" },
  { value: "aoc", label: "Operator AOC" },
] as const;

export function LumiTryPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("pilot_licence");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err" | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setTone("warn");
      setMessage("Choose a file first — a PDF or a clear photo of the document.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setTone(null);
    setExtracted(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch("/api/lumi/try", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (res.status === 503) return done("err", data?.message ?? "Lumi isn't switched on yet.");
      if (res.status === 429) return done("warn", data?.message ?? "Demo limit reached. Please try again later.");
      if (res.status === 413) return done("warn", "That file is too large (max 4 MB).");
      if (res.status === 415) return done("warn", "Upload a PDF or an image (JPG, PNG, WEBP).");
      if (!res.ok || !data?.ok) return done("err", data?.message ?? "Lumi couldn't read that. Try a clearer copy.");

      const ex: Extracted = data.extracted;
      setExtracted(ex);
      if (!ex.isExpectedDocument) {
        done("warn", "Lumi read the file, but it doesn't look like the document type you picked:");
      } else if (ex.confidence < 0.7) {
        done("warn", "Lumi read it, but the scan isn't clear enough to confirm confidently:");
      } else {
        done("ok", "Lumi read it cleanly. Here's what it found — in the real app this confirms your credential:");
      }
    } catch {
      done("err", "Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function done(t: "ok" | "warn" | "err", m: string) {
    setTone(t);
    setMessage(m);
  }

  const toneCls =
    tone === "ok"
      ? "border-emerald-status/40 bg-emerald-status/10 text-emerald-status"
      : tone === "warn"
        ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
        : "border-red-400/40 bg-red-400/10 text-red-200";

  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold-light">Li</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ivory">Try Lumi — no account needed</p>
          <p className="mt-1 text-xs text-slate-tac">
            Pick a document type, upload a PDF or a clear photo, and Lumi reads it in seconds. This is a demo:
            nothing is saved, nothing is shared, and no account is created.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-tac">Document type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-obsidian/60 px-3 py-2.5 text-sm text-ivory focus:border-gold/50 focus:outline-none"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="block max-w-full text-xs text-slate-tac file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-ivory hover:file:bg-white/15"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60"
              >
                {busy ? "Lumi is reading…" : "Verify"}
              </button>
            </div>
            {fileName && !busy && !message && <p className="text-xs text-slate-tac">Selected: {fileName}</p>}
          </div>

          {message && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${toneCls}`} aria-live="polite">
              <p>{message}</p>
              {extracted && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-black/20 p-3 text-xs text-slate-tac sm:grid-cols-2">
                  <Row label="Document" value={extracted.documentType} />
                  <Row label="Name" value={extracted.holderName} />
                  <Row label="Licence / cert no." value={extracted.licenceNumber} />
                  <Row label="Type / category" value={extracted.licenceType} />
                  <Row label="Status" value={extracted.status} />
                  <Row label="Issued" value={extracted.issued} />
                  <Row label="Expires" value={extracted.expires} />
                  {extracted.aocNumber && <Row label="AOC number" value={extracted.aocNumber} />}
                  {extracted.approvedTypes.length > 0 && <Row label="Approved types" value={extracted.approvedTypes.join(", ")} />}
                  {extracted.totalHours != null && <Row label="Total hours" value={extracted.totalHours.toLocaleString("en-ZA")} />}
                  {extracted.medical?.class != null && (
                    <Row label="Medical" value={`Class ${extracted.medical.class}${extracted.medical.expires ? ` · to ${extracted.medical.expires}` : ""}`} />
                  )}
                  <Row label="Confidence" value={`${Math.round(extracted.confidence * 100)}%`} />
                  {extracted.ratings.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-ivory">Ratings</dt>
                      <dd className="mt-0.5">{extracted.ratings.map((r) => `${r.name}${r.expires ? ` (to ${r.expires})` : ""}`).join(", ")}</dd>
                    </div>
                  )}
                  {extracted.issues.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-amber-200">Notes from Lumi</dt>
                      <dd className="mt-0.5 text-amber-200">{extracted.issues.join("; ")}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-ivory">{label}</dt>
      <dd className="mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}
