import type { ReactNode } from "react";

export type PillTone = "gold" | "ok" | "warn" | "err" | "neutral";

const TONE: Record<PillTone, string> = {
  gold: "bg-gold/15 text-gold-light",
  ok: "bg-emerald-status/15 text-emerald-status",
  warn: "bg-warn/15 text-warn",
  err: "bg-alert/15 text-alert",
  neutral: "bg-white/5 text-slate-tac",
};

/** Status / source badge. Replaces the six hand-rolled pill variants. */
export function Pill({ tone = "neutral", children, className = "" }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${TONE[tone]} ${className}`}>{children}</span>;
}
