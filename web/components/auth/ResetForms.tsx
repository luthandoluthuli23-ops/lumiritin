"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormError, TextField, apiErrorMessage, primaryBtn } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { res, data: await res.json().catch(() => null) };
}

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/forgot", { email });
      if (!res.ok) setError(apiErrorMessage(data));
      else setSent(email);
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="glass rounded-3xl p-8 text-sm text-slate-tac" role="status">
        <p className="text-ivory">Check your email.</p>
        <p className="mt-2">
          If there&apos;s a Lumiritin account for <span className="text-ivory">{sent}</span>, we&apos;ve sent a link to reset your
          password. It works for one hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="glass grid gap-5 rounded-3xl p-8">
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password !== String(f.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/reset", { token, password });
      if (res.ok) {
        window.location.assign(data.redirect);
        return;
      }
      if (data?.error === "reset_link_invalid") setInvalid(true);
      else setError(apiErrorMessage(data));
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  }

  if (invalid) {
    return (
      <div className="glass rounded-3xl p-8 text-sm text-slate-tac" role="alert">
        <p className="text-ivory">This link has expired or was already used.</p>
        <Link href="/auth/forgot" className="mt-3 inline-block text-gold-light underline underline-offset-4">
          Send a new link
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="glass grid gap-5 rounded-3xl p-8">
      <PasswordField label="New password" name="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." required />
      <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" minLength={10} required />
      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
