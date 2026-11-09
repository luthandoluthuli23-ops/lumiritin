import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "err" | "info";

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-status/10 text-emerald-status",
  warn: "bg-warn/10 text-warn",
  err: "bg-alert/10 text-alert",
  info: "bg-white/5 text-slate-tac",
};

/**
 * The one banner/message component. Replaces the hand-rolled amber-*, red-* and emerald-* variants.
 * Errors are announced immediately (role="alert"); everything else politely (role="status").
 */
export function Alert({ tone = "info", title, children, className = "" }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "err" ? "alert" : "status"} className={`rounded-lg px-4 py-2.5 text-sm ${TONE[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>}
    </div>
  );
}
