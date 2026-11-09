"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { FormError, apiErrorMessage, cardCls, inputCls, primaryBtn } from "@/components/ui/Field";

/** Invite a pilot to the roster by account email. Used on both the pilots and the bench pages. */
export function InvitePilotForm({ hint }: { hint?: string }) {
  const router = useRouter();
  const fieldId = useId();
  const hintId = useId();
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
    <form onSubmit={submit} className={cardCls}>
      <label htmlFor={fieldId} className="block text-xs uppercase tracking-widest text-slate-tac">Invite a pilot by account email</label>
      {/* Stacked on phones; input and button share one row (equal height) from sm. The mt-2 on both comes from inputCls. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-stretch sm:gap-3">
        <input
          id={fieldId}
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="pilot@example.com"
          aria-describedby={hint ? hintId : undefined}
          className={`${inputCls} min-w-0 sm:flex-1`}
        />
        <button type="submit" disabled={busy} className={`${primaryBtn} mt-2 shrink-0`}>{busy ? "Sending…" : "Send invite"}</button>
      </div>
      {hint && <p id={hintId} className="mt-2 text-xs text-slate-tac">{hint}</p>}
      {message && <Alert tone="ok" className="mt-3">{message}</Alert>}
      {error && <div className="mt-3"><FormError message={error} /></div>}
    </form>
  );
}
