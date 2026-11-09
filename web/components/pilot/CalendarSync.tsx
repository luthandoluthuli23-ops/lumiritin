"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { FormError, TextField, cardCls, ghostBtn, primaryBtn } from "@/components/ui/Field";
import { formatDateTime } from "./format";

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
    <section className={cardCls} aria-labelledby="cal-h">
      <h2 id="cal-h" className="font-display text-2xl text-ivory">External calendar</h2>
      <p className="mt-2 text-sm text-slate-tac">
        Block out flying you do outside Lumiritin. Busy events from your calendar (next 90 days) make you unavailable for those times. Only the times are
        stored, never event titles.
      </p>

      {connected ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ivory">
            Connected to <span className="break-all font-mono text-gold-light">{host ?? "calendar"}</span>
            {syncedAt ? ` · last synced ${formatDateTime(syncedAt)}` : ""} · {blockedPeriods} blocked period{blockedPeriods === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={busy} onClick={() => call("POST", { resync: true })} className={primaryBtn}>{busy ? "Syncing…" : "Sync now"}</button>
            <button type="button" disabled={busy} onClick={() => call("DELETE")} className={ghostBtn}>Disconnect</button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField label="iCal feed link" name="url" placeholder="https://calendar.google.com/…/basic.ics" />
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Connecting…" : "Connect"}</button>
          <p className="text-xs text-slate-tac sm:col-span-2">Google Calendar: Settings → your calendar → “Secret address in iCal format”. Outlook and Apple calendars offer a similar link.</p>
        </form>
      )}

      {summary && (
        <div className="mt-4 space-y-2">
          <Alert tone="ok">Imported {summary.imported} busy period{summary.imported === 1 ? "" : "s"}.</Alert>
          {summary.skipped.recurring > 0 && (
            <Alert tone="warn">{summary.skipped.recurring} repeating event{summary.skipped.recurring === 1 ? " was" : "s were"} NOT imported: block those manually.</Alert>
          )}
          {summary.skipped.unsupportedZone > 0 && (
            <Alert tone="warn">{summary.skipped.unsupportedZone} event{summary.skipped.unsupportedZone === 1 ? "" : "s"} in an unsupported time zone skipped.</Alert>
          )}
        </div>
      )}
      <div className="mt-4 empty:hidden"><FormError message={error} /></div>
    </section>
  );
}
