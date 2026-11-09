"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pill } from "@/components/ui/Pill";

const TABS = [
  { href: "/operator/dashboard", label: "Dashboard" },
  { href: "/operator/fleet", label: "Fleet" },
  { href: "/operator/crewing", label: "Crew requests" },
  { href: "/operator/pilots", label: "My pilots" },
  { href: "/operator/insights", label: "Insights" },
  { href: "/operator/bench", label: "Bench" },
  { href: "/operator/notifications", label: "Notifications" },
];

export function OperatorNav({ operatorName, isPrivate = false }: { operatorName: string; isPrivate?: boolean }) {
  const path = usePathname();
  const tabs = useRef<HTMLElement>(null);

  // On phones the tab strip scrolls sideways, so bring the current tab into view when the page changes.
  useEffect(() => {
    const strip = tabs.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (strip && current) strip.scrollLeft = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
  }, [path]);

  return (
    <div className="border-b border-white/10 px-4 pt-28 sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-7xl px-safe lg:flex lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0 pb-3">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Operator portal</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl text-ivory">
            <span className="truncate" title={operatorName}>{operatorName}</span>
            {isPrivate && <Pill className="shrink-0">Private</Pill>}
          </p>
        </div>
        {/* Edge-to-edge scroller on phones and tablets (the fade hints at more tabs); a plain row once all tabs fit. */}
        <nav
          ref={tabs}
          aria-label="Operator"
          className="relative -mx-4 -mb-px flex snap-x overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%_-_1rem),transparent)] [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => {
            const on = path === t.href || (t.href !== "/operator/dashboard" && path.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap border-b-2 px-4 text-sm transition-colors focus-visible:-outline-offset-2 ${on ? "border-gold text-gold-light" : "border-transparent text-slate-tac hover:text-ivory"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
