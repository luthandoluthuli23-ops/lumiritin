"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/operator/dashboard", label: "Dashboard" },
  { href: "/operator/fleet", label: "Fleet" },
  { href: "/operator/crewing", label: "Requests" },
  { href: "/operator/pilots", label: "My Pilots" },
  { href: "/operator/insights", label: "Insights" },
  { href: "/operator/bench", label: "Bench" },
  { href: "/operator/notifications", label: "Notifications" },
];

export function OperatorNav({ operatorName, isPrivate = false }: { operatorName: string; isPrivate?: boolean }) {
  const path = usePathname();
  return (
    <div className="border-b border-white/10 px-6 pt-24">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
        <div className="pb-3">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Operator portal</p>
          <p className="flex items-center gap-2 font-display text-2xl text-ivory">
            {operatorName}
            {isPrivate && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-sans text-slate-tac">Private</span>}
          </p>
        </div>
        <nav aria-label="Operator" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const on = path === t.href || (t.href !== "/operator/dashboard" && path.startsWith(t.href.replace(/\/new$/, "")));
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${on ? "border-gold text-gold-light" : "border-transparent text-slate-tac hover:text-ivory"}`}>
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
