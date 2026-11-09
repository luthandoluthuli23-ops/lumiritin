"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, type Tone } from "@/components/ui/Alert";
import { primaryBtnSm } from "@/components/ui/Field";
import { fileInputCls } from "./logbook-shared";

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

interface PanelProps {
  label?: string;
  /** API route to POST the file to. Defaults to the crew licence endpoint. */
  endpoint?: string;
  /** Override the explanatory copy (operators have different instructions). */
  description?: string;
}

/** Sits inside a card (the licence card on the wallet, the AOC card on the operator dashboard). */
export function LumiVerifyPanel({ label = "your SACAA licence", endpoint = "/api/lumi/verify", description }: PanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  async function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      done("warn", "Choose a file first — a PDF or a clear photo of your licence.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setExtracted(null);
    setReasons([]);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
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

  function done(tone: Tone, text: string) {
    setNotice({ tone, text });
  }

  return (
    <div className="mt-4 rounded-2xl bg-white/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-sm font-semibold text-gold-light" aria-hidden>Li</div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl text-ivory">Verify with Lumi</h3>
          <p className="mt-1 text-sm text-slate-tac">
            {description ??
              `Upload ${label} — the PDF you download from the SACAA card-scan (after the OTP on your phone), or a clear photo of your card. Lumi reads it and confirms your credential in seconds. Nothing is shared publicly.`}
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={inputRef}
              type="file"
              aria-label="Your licence file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className={fileInputCls}
            />
            <button type="button" onClick={submit} disabled={busy} className={`${primaryBtnSm} w-full shrink-0 sm:w-auto`}>
              {busy ? "Lumi is reading…" : "Verify"}
            </button>
          </div>
          {fileName && !busy && !notice && <p className="mt-2 break-words text-sm text-slate-tac">Selected: {fileName}</p>}

          {notice && (
            <Alert tone={notice.tone} className="mt-3">
              <p>{notice.text}</p>
              {reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {extracted && (
                <div className="mt-3 rounded-lg bg-obsidian/40 p-3 text-xs text-slate-tac">
                  <p className="text-ivory">What Lumi read</p>
                  <p className="mt-1 break-words">
                    {extracted.documentType ?? "Document"}
                    {extracted.holderName ? ` · ${extracted.holderName}` : ""}
                    {extracted.licenceNumber ? ` · ${extracted.licenceNumber}` : ""}
                  </p>
                  <p className="mt-0.5 break-words">
                    {extracted.licenceType ?? "—"}
                    {extracted.status ? ` · ${extracted.status}` : ""}
                    {extracted.expires ? ` · expires ${extracted.expires}` : ""}
                    {` · confidence ${Math.round(extracted.confidence * 100)}%`}
                  </p>
                  {extracted.issues.length > 0 && <p className="mt-1 break-words text-warn">Notes: {extracted.issues.join("; ")}</p>}
                </div>
              )}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
