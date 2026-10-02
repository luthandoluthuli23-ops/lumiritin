"use client";

import { useEffect, useRef } from "react";
import { animateCounter } from "@/lib/animations";

interface Metric {
  to: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

// `activeEmptyLegs` is live from the database. The other two are product targets / policy, not measurements:
// replace them with real numbers (verified-crew ratio from verification_log, dispatch time from request timestamps)
// before launch.
export function MetricCounters({ activeEmptyLegs }: { activeEmptyLegs: number }) {
  const metrics: Metric[] = [
    { to: activeEmptyLegs, label: "Active empty legs" },
    { to: 100, suffix: "%", label: "SACAA-verified crew" },
    { to: 2, prefix: "< ", suffix: " hr", label: "Dispatch time" },
  ];

  return (
    <dl className="mx-auto grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-3">
      {metrics.map((m) => (
        <div key={m.label} className="bg-obsidian-800 px-8 py-8 text-center">
          <dd className="font-display text-6xl text-gold-gradient">
            {m.prefix}
            <Count to={m.to} />
            {m.suffix}
          </dd>
          <dt className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-tac">{m.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Count({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => (ref.current ? animateCounter(ref.current, to) : undefined), [to]);
  return <span ref={ref}>{to}</span>;
}
