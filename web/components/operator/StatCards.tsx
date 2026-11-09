"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { MotionConfig, motion } from "framer-motion";
import { animateCounter, flightCardVariant, staggerContainer } from "@/lib/animations";
import { cardCls } from "@/components/ui/Field";

interface Stat {
  label: string;
  /** Numbers count up as they scroll into view; text (currency, percentages) is shown as given. */
  value: number | string;
  href: string | null;
  note?: string;
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.ul variants={staggerContainer(0.08)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <motion.li key={s.label} variants={flightCardVariant} className="list-none">
            {s.href ? (
              <Link href={s.href} className={`${cardCls} block h-full transition hover:border-gold/40`}><Body stat={s} /></Link>
            ) : (
              <div className={`${cardCls} h-full`}><Body stat={s} /></div>
            )}
          </motion.li>
        ))}
      </motion.ul>
    </MotionConfig>
  );
}

function Body({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { value } = stat;
  useEffect(() => (typeof value === "number" && ref.current ? animateCounter(ref.current, value, { duration: 1.2 }) : undefined), [value]);
  return (
    <>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-tac">{stat.label}</p>
      <p className="mt-3 font-display text-4xl text-gold-gradient"><span ref={ref}>{value}</span></p>
      {stat.note && <p className="mt-1 text-xs text-slate-tac">{stat.note}</p>}
    </>
  );
}
