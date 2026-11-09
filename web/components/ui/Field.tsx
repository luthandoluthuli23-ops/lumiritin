import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const inputCls =
  "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10 disabled:opacity-50";

export const primaryBtn =
  "rounded-full bg-gold px-6 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light";

export const ghostBtn =
  "rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-ivory transition hover:border-gold/60 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light";

// ── Compact buttons for dense UI (toolbars, table rows, panels). `pointer-coarse:` means "this is a touch screen"
// (phones AND tablets, at any width), where they grow to the 44px minimum touch target; with a mouse they stay compact.
const smBtn = "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light pointer-coarse:min-h-11";
export const primaryBtnSm = `${smBtn} bg-gold text-obsidian hover:bg-gold-light`;
export const ghostBtnSm = `${smBtn} border border-white/20 text-ivory hover:border-gold/60`;
/** Destructive action that needs emphasis (e.g. "Disconnect", "Delete"). For a quiet inline delete use dangerTextBtn. */
export const dangerBtn = `${smBtn} border border-alert/40 text-alert hover:bg-alert/10`;
export const dangerTextBtn =
  "inline-flex items-center rounded-full px-3 py-1.5 text-sm text-slate-tac transition hover:text-alert disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light pointer-coarse:min-h-11";

/** Dense-form input (panels, table editors). Text is 16px on touch screens so iOS never zooms the page on focus. */
export const inputSmCls =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10 disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:text-base";
export const labelSmCls = "mb-1 block text-xs uppercase tracking-widest text-slate-tac";

// ── Layout constants: one page container, one card. Mobile gets tighter gutters; sm: and up match the desktop design.
/** Page container under the fixed navbar. Narrow pages swap max-w-5xl for max-w-3xl / max-w-xl. */
export const pageCls = "mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32";
export const cardCls = "glass rounded-3xl p-5 sm:p-6";
/** A list row / compact card. */
export const rowCardCls = "glass rounded-2xl p-4 sm:p-5";

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
// For success / warning / info messages use <Alert tone="ok|warn|err|info"> from components/ui/Alert.tsx.

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
