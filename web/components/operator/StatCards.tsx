"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { animateCounter, flightCardVariant, staggerContainer } from "@/lib/animations";

interface Stat {
  label: string;
  value: number;
  href: string | null;
  note?: string;
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <motion.ul variants={staggerContainer(0.08)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <motion.li key={s.label} variants={flightCardVariant} className="list-none">
          {s.href ? (
            <Link href={s.href} className="glass block rounded-3xl p-6 transition hover:border-gold/40"><Body stat={s} /></Link>
          ) : (
            <div className="glass rounded-3xl p-6"><Body stat={s} /></div>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function Body({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => (ref.current ? animateCounter(ref.current, stat.value, { duration: 1.2 }) : undefined), [stat.value]);
  return (
    <>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-tac">{stat.label}</p>
      <p className="mt-3 font-display text-5xl text-gold-gradient"><span ref={ref}>{stat.value}</span></p>
      {stat.note && <p className="mt-1 text-xs text-slate-tac">{stat.note}</p>}
    </>
  );
}
