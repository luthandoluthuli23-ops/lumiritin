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
      if (!res.ok) return setError(apiErrorMessage(data));
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass grid gap-5 rounded-3xl p-8">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
