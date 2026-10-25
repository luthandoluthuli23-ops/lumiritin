"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError, TextField, apiErrorMessage, primaryBtn } from "@/components/ui/Field";

export function SigninForm({ next }: { next: string | null }) {
  const router = useRouter();
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
      // Navigate within the app (fast, no full reload) and refresh so the new session shows in the
      // shared navbar. We intentionally do NOT reset `busy` on success: the button stays in its
      // loading state until the destination paints and this form unmounts, so there is no dead gap.
      router.replace(data.redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass grid gap-5 rounded-3xl p-8">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
