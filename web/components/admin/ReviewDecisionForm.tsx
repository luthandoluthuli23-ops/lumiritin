"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { dangerBtn, ghostBtnSm, inputSmCls, primaryBtnSm } from "@/components/ui/Field";

const FIELDS = [
  { key: "name", label: "Name on the documents matches the profile name" },
  { key: "licenceNumber", label: "Licence number on the licence matches the profile" },
  { key: "licenceType", label: "Licence type matches what the pilot entered" },
  { key: "licenceExpiry", label: "Licence expiry matches what the pilot entered" },
  { key: "medicalExpiry", label: "Medical class and expiry match what the pilot entered" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

/** The reviewer ticks each field they confirmed. "Verified" is only enabled once every box is ticked. */
export function ReviewDecisionForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [matches, setMatches] = useState<Record<Key, boolean>>({ name: false, licenceNumber: false, licenceType: false, licenceExpiry: false, medicalExpiry: false });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allMatch = FIELDS.every((f) => matches[f.key]);

  async function decide(decision: "VERIFIED" | "MISMATCH" | "UNREADABLE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/review/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, matches, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          d.error === "already_decided" ? "Someone already decided this submission." : d.error === "own_submission" ? "You can't review your own documents." : "That didn't save. Please try again.",
        );
        return;
      }
      router.push("/admin/review");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs uppercase tracking-widest text-slate-tac">What you confirmed</legend>
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-start gap-3 text-sm text-ivory pointer-coarse:min-h-11">
            <input type="checkbox" checked={matches[f.key]} onChange={(e) => setMatches((m) => ({ ...m, [f.key]: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-[#d4af37]" />
            {f.label}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="text-xs uppercase tracking-widest text-slate-tac">Note (optional, kept in the audit log)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className={`${inputSmCls} mt-1`} />
      </label>
      {error && <Alert tone="err">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !allMatch} onClick={() => decide("VERIFIED")} className={primaryBtnSm} title={allMatch ? "" : "Tick every field first"}>
          Verified
        </button>
        <button type="button" disabled={busy} onClick={() => decide("MISMATCH")} className={dangerBtn}>Mismatch</button>
        <button type="button" disabled={busy} onClick={() => decide("UNREADABLE")} className={ghostBtnSm}>Can&rsquo;t read / wrong document</button>
      </div>
    </div>
  );
}
