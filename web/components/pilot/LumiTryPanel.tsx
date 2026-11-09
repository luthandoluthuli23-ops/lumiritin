"use client";

import { useRef, useState } from "react";
import { Alert, type Tone } from "@/components/ui/Alert";
import { SelectField, cardCls, primaryBtnSm } from "@/components/ui/Field";
import { fileInputCls } from "./logbook-shared";

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
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      done("warn", "Choose a file first — a PDF or a clear photo of the document.");
      return;
    }
    setBusy(true);
    setNotice(null);
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

  function done(tone: Tone, text: string) {
    setNotice({ tone, text });
  }

  return (
    <section aria-labelledby="try-lumi-h" className={`${cardCls} border border-gold/40`}>
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold-light" aria-hidden>Li</div>
        <div className="min-w-0 flex-1">
          <h2 id="try-lumi-h" className="font-display text-2xl text-ivory">Try Lumi — no account needed</h2>
          <p className="mt-2 text-sm text-slate-tac">
            Pick a document type, upload a PDF or a clear photo, and Lumi reads it in seconds. This is a demo:
            nothing is saved, nothing is shared, and no account is created.
          </p>

          <div className="mt-5 space-y-4">
            <SelectField label="Document type" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </SelectField>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                ref={inputRef}
                type="file"
                aria-label="Document to verify"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className={fileInputCls}
              />
              <button type="button" onClick={submit} disabled={busy} className={`${primaryBtnSm} w-full shrink-0 sm:w-auto`}>
                {busy ? "Lumi is reading…" : "Verify"}
              </button>
            </div>
            {fileName && !busy && !notice && <p className="break-words text-sm text-slate-tac">Selected: {fileName}</p>}
          </div>

          {notice && (
            <Alert tone={notice.tone} className="mt-4">
              <p>{notice.text}</p>
              {extracted && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-obsidian/40 p-3 text-xs text-slate-tac sm:grid-cols-2">
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
                      <dd className="mt-0.5 break-words">{extracted.ratings.map((r) => `${r.name}${r.expires ? ` (to ${r.expires})` : ""}`).join(", ")}</dd>
                    </div>
                  )}
                  {extracted.issues.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-warn">Notes from Lumi</dt>
                      <dd className="mt-0.5 break-words text-warn">{extracted.issues.join("; ")}</dd>
                    </div>
                  )}
                </dl>
              )}
            </Alert>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-ivory">{label}</dt>
      <dd className="mt-0.5 break-words">{value ?? "—"}</dd>
    </div>
  );
}
