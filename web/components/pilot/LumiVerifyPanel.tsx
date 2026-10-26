"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Extracted {
  documentType: string | null;
  licenceNumber: string | null;
  holderName: string | null;
  licenceType: string | null;
  status: string | null;
  expires: string | null;
  ratings: { name: string; expires: string | null }[];
  confidence: number;
  issues: string[];
}

export function LumiVerifyPanel({ label = "your SACAA licence" }: { label?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err" | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setTone("warn");
      setMessage("Choose a file first — a PDF or a clear photo of your licence.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setTone(null);
    setExtracted(null);
    setReasons([]);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/lumi/verify", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (res.status === 503) return done("err", data?.message ?? "Lumi isn't switched on yet.");
      if (res.status === 429) return done("warn", data?.message ?? "Too many attempts. Please wait a few minutes.");
      if (res.status === 413) return done("warn", "That file is too large (max 4 MB).");
      if (res.status === 415) return done("warn", "Upload a PDF or an image (JPG, PNG, WEBP).");
      if (!res.ok || !data?.ok) return done("err", data?.message ?? "Verification failed. Please try again.");

      setExtracted(data.extracted ?? null);
      if (data.verified) {
        done("ok", "Verified by Lumi. Your credential is now confirmed.");
        router.refresh();
      } else {
        setReasons(Array.isArray(data.reasons) ? data.reasons : []);
        done("warn", "Lumi couldn't auto-verify this yet:");
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
    <div className="mt-2 rounded-2xl border border-gold/25 bg-gold/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold-light">Li</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ivory">Verify with Lumi</p>
          <p className="mt-1 text-xs text-slate-tac">
            Upload {label} — the PDF you download from the SACAA card-scan (after the OTP on your phone), or a clear photo of your card.
            Lumi reads it and confirms your credential in seconds. Nothing is shared publicly.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          {fileName && !busy && !message && <p className="mt-2 text-xs text-slate-tac">Selected: {fileName}</p>}

          {message && (
            <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${toneCls}`} aria-live="polite">
              <p>{message}</p>
              {reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {extracted && (
                <div className="mt-3 rounded-lg bg-black/20 p-3 text-xs text-slate-tac">
                  <p className="text-ivory">What Lumi read</p>
                  <p className="mt-1">
                    {extracted.documentType ?? "Document"}
                    {extracted.holderName ? ` · ${extracted.holderName}` : ""}
                    {extracted.licenceNumber ? ` · ${extracted.licenceNumber}` : ""}
                  </p>
                  <p className="mt-0.5">
                    {extracted.licenceType ?? "—"}
                    {extracted.status ? ` · ${extracted.status}` : ""}
                    {extracted.expires ? ` · expires ${extracted.expires}` : ""}
                    {` · confidence ${Math.round(extracted.confidence * 100)}%`}
                  </p>
                  {extracted.issues.length > 0 && <p className="mt-1 text-amber-200">Notes: {extracted.issues.join("; ")}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
