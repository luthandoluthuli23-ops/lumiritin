"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Password input with a show/hide eye so people can check what they typed. */
export function PasswordField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-tac">{label}</span>
      <div className="relative mt-2">
        <input
          {...props}
          type={show ? "text" : "password"}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-tac transition hover:text-ivory"
        >
          {show ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
              <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.1M6.1 6.1A18.5 18.5 0 0 0 2 12s3.5 8 10 8a10.9 10.9 0 0 0 3.2-.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <span className="mt-1.5 block text-xs text-slate-tac">{hint}</span>}
    </label>
  );
}
