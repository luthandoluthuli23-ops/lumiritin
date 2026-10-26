"use client";

import { useState } from "react";

export function RunRemindersButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/operator/run-reminders", { method: "POST" });
      const data = await res.json().catch(() => null);
      setMsg({ ok: Boolean(data?.ok), text: data?.message ?? (res.ok ? "Done." : "Something went wrong.") });
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
        {busy ? "Running…" : "Run expiry reminders now"}
      </button>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-status" : "text-alert"}`}>{msg.text}</p>}
    </div>
  );
}
