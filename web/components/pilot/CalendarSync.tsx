"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError, TextField, ghostBtn, primaryBtn } from "@/components/ui/Field";

interface Props {
  connected: boolean;
  host: string | null;
  syncedAt: string | null;
  lastError: string | null;
  blockedPeriods: number;
}

interface Summary {
  imported: number;
  skipped: { recurring: number; unsupportedZone: number; notBusy: number; invalid: number };
}

export function CalendarSync({ connected, host, syncedAt, lastError, blockedPeriods }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(lastError);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function call(method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/calendar-sync", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.message ?? "Something went wrong. Please try again.");
      setSummary(method === "POST" ? data : null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get("url") ?? "").trim();
    if (url) void call("POST", { url });
  }

  return (
    <section className="glass rounded-3xl p-6" aria-labelledby="cal-h">
      <h2 id="cal-h" className="text-xs uppercase tracking-[0.25em] text-slate-tac">External calendar</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Block out flying you do outside Lumiritin. Busy events from your calendar (next 90 days) make you unavailable for those times. Only the times are
        stored, never event titles.
      </p>

      {connected ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ivory">
            Connected to <span className="font-mono text-gold-light">{host ?? "calendar"}</span>
            {syncedAt ? ` · last synced ${new Date(syncedAt).toLocaleString("en-ZA")}` : ""} · {blockedPeriods} blocked period{blockedPeriods === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => call("POST", { resync: true })} className={primaryBtn}>{busy ? "Syncing…" : "Sync now"}</button>
            <button type="button" disabled={busy} onClick={() => call("DELETE")} className={ghostBtn}>Disconnect</button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField label="iCal feed link" name="url" placeholder="https://calendar.google.com/…/basic.ics" hint="Google Calendar: Settings → your calendar → “Secret address in iCal format”. Outlook and Apple calendars offer a similar link." />
          <button type="submit" disabled={busy} className={`${primaryBtn} sm:mb-[2.2rem]`}>{busy ? "Connecting…" : "Connect"}</button>
        </form>
      )}

      {summary && (
        <p className="mt-3 rounded-xl bg-emerald-status/10 px-4 py-2.5 text-sm text-emerald-status" role="status">
          Imported {summary.imported} busy period{summary.imported === 1 ? "" : "s"}.
          {summary.skipped.recurring > 0 && <span className="text-gold-light"> {summary.skipped.recurring} repeating event{summary.skipped.recurring === 1 ? " was" : "s were"} NOT imported: block those manually.</span>}
          {summary.skipped.unsupportedZone > 0 && <span className="text-gold-light"> {summary.skipped.unsupportedZone} event{summary.skipped.unsupportedZone === 1 ? "" : "s"} in an unsupported time zone skipped.</span>}
        </p>
      )}
      <div className="mt-3"><FormError message={error} /></div>
    </section>
  );
}
