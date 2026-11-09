import type { ReactNode } from "react";

/** Eyebrow + h1 (+ sub-copy and an optional action). The size steps down on small phones so long titles never wrap awkwardly. */
export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs uppercase tracking-[0.35em] text-gold">{eyebrow}</p>}
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-xl text-slate-tac">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
