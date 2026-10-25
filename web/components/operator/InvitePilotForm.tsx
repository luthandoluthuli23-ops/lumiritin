"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError, TextField, apiErrorMessage, primaryBtn } from "@/components/ui/Field";

export function InvitePilotForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email");
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/operator/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) setError(apiErrorMessage(data));
      else {
        setMessage(data?.message ?? "Invitation sent.");
        form.reset();
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <TextField label="Invite a pilot by account email" name="email" type="email" required placeholder="pilot@example.com" autoComplete="off" />
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Send invite"}</button>
      </div>
      {message && <p className="mt-3 text-sm text-emerald-status">{message}</p>}
      <div className="mt-2"><FormError message={error} /></div>
    </form>
  );
}
