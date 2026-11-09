"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { primaryBtn } from "@/components/ui/Field";

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
      <button type="button" onClick={run} disabled={busy} className={primaryBtn}>
        {busy ? "Running…" : "Run expiry reminders now"}
      </button>
      {msg && <Alert tone={msg.ok ? "ok" : "err"} className="mt-4">{msg.text}</Alert>}
    </div>
  );
}
