import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const inputCls =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10 disabled:opacity-50";

export const primaryBtn =
  "rounded-full bg-gold px-6 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light";

export const ghostBtn =
  "rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-ivory transition hover:border-gold/60 disabled:opacity-40";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-tac">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-slate-tac">{hint}</span>}
    </label>
  );
}

export function TextField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint}>
      <input {...props} className={inputCls} />
    </Field>
  );
}

export function SelectField({ label, hint, children, ...props }: { label: string; hint?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint}>
      <select {...props} className={`${inputCls} appearance-none`}>
        {children}
      </select>
    </Field>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-alert/10 px-4 py-2.5 text-sm text-alert">
      {message}
    </p>
  ) : null;
}

/** Turns an API error body ({ error, issues }) into one readable sentence. */
export function apiErrorMessage(data: { error?: string; issues?: { path: string; message: string }[] } | null, fallback = "Something went wrong. Please try again."): string {
  if (!data) return fallback;
  if (data.issues?.length) return data.issues.map((i) => `${i.path ? `${i.path}: ` : ""}${i.message}`).join(" · ");
  const known: Record<string, string> = {
    email_in_use: "An account with that email already exists. Try signing in.",
    licence_already_registered: "That licence number is already registered.",
    aoc_already_registered: "That AOC number is already registered.",
    invalid_credentials: "Incorrect email or password.",
    rate_limited: "Too many attempts. Please wait a while and try again.",
    unauthorised: "Please sign in to continue.",
    forbidden: "Your account can't do that.",
  };
  return (data.error && known[data.error]) || fallback;
}
