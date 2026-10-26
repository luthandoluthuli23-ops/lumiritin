"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Outcome = "VERIFIED" | "NOT_FOUND" | "BLOCKED" | "PORTAL_ERROR" | null;

interface Props {
  /** Current stored verification result, or null if never checked. */
  lastResult: Outcome;
  lastVerifiedAt: string | null;
  /** Run a check automatically on first mount (e.g. a brand-new licence that's never been verified). */
  autoRun: boolean;
}

const BADGE: Record<Exclude<Outcome, null>, { label: string; cls: string }> = {
  VERIFIED: { label: "Verified with SACAA", cls: "border-emerald-status/40 bg-emerald-status/10 text-emerald-status" },
  NOT_FOUND: { label: "Not found on SACAA", cls: "border-red-400/40 bg-red-400/10 text-red-300" },
  BLOCKED: { label: "Check unavailable", cls: "border-amber-300/40 bg-amber-300/10 text-amber-200" },
  PORTAL_ERROR: { label: "Portal unavailable", cls: "border-amber-300/40 bg-amber-300/10 text-amber-200" },
};

function messageFor(outcome: Outcome, status: string | null): string {
  switch (outcome) {
    case "VERIFIED":
      return `Verified against the SACAA register${status ? ` — status: ${status}` : ""}.`;
    case "NOT_FOUND":
      return "This licence number was not found on the SACAA register. Check the number and try again.";
    case "BLOCKED":
      return "SACAA is temporarily blocking automated checks. Please try again in a few minutes.";
    case "PORTAL_ERROR":
      return "Couldn't reach the SACAA portal right now. We'll keep retrying — your stored status is unchanged.";
    default:
      return "";
  }
}

export function VerifyLicenceButton({ lastResult, lastVerifiedAt, autoRun }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pilot/verify-licence", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.status === 429) return setMessage(data?.message ?? "Too many checks. Please wait a few minutes.");
      if (res.status === 404) return setMessage(data?.message ?? "No pilot licence on file to verify.");
      if (!res.ok || !data) return setMessage("Verification failed. Please try again.");
      setMessage(messageFor(data.outcome as Outcome, data.status ?? null));
      router.refresh(); // reflect the updated credential/ratings/medical in the wallet
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Auto-verify once for a licence that's never been checked, so verification is live without a manual click.
  useEffect(() => {
    if (autoRun && !ran.current) {
      ran.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const badge = lastResult ? BADGE[lastResult] : { label: "Unverified", cls: "border-white/15 bg-white/5 text-slate-tac" };

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
          {!lastVerifiedAt && <p className="mt-2 text-xs text-slate-tac">Never checked against SACAA</p>}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60"
        >
          {busy ? "Checking SACAA…" : lastResult ? "Re-check with SACAA" : "Verify with SACAA"}
        </button>
      </div>
      {message && <p className="mt-3 rounded-lg bg-white/5 px-4 py-3 text-sm text-slate-tac" aria-live="polite">{message}</p>}
    </div>
  );
}
