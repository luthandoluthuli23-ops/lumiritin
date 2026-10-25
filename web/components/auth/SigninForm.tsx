"use client";

import { useState, type FormEvent } from "react";
import { FormError, TextField, apiErrorMessage, primaryBtn } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";

export function SigninForm({ next }: { next: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), password: f.get("password"), next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(data));
        setBusy(false);
        return;
      }
      // Full navigation to the destination. The session cookie is already set, so the authed page
      // renders reliably — in-app router navigation could stall here and leave the button hung.
      // We keep `busy` true so the button stays loading until the page unloads: no dead gap.
      window.location.assign(data.redirect);
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass grid gap-5 rounded-3xl p-8">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField label="Password" name="password" autoComplete="current-password" required />
      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
