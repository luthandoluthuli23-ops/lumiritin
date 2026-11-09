import type { ReactNode } from "react";

/** "Nothing here yet" panel. One look for every empty list/table in the portals. */
export function EmptyState({ title, children, action, className = "" }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl p-6 text-center sm:p-8 ${className}`}>
      <p className="font-display text-xl text-ivory">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate-tac">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
