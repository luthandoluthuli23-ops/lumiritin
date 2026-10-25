"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { flightCardVariant, jetCardHover, staggerContainer, trackSpotlight } from "@/lib/animations";

const PORTALS = [
  {
    eyebrow: "Passengers",
    title: "Fly private, on demand",
    body: "Charter an aircraft anywhere in South Africa and get an instant estimate. Request in under a minute.",
    cta: "Request a charter quote",
    href: "/charter",
  },
  {
    eyebrow: "Operators",
    title: "Fill every sector",
    body: "Manage your fleet, post urgent crew requests and match SACAA-verified pilots in minutes.",
    cta: "Open operator portal",
    href: "/operator/dashboard",
  },
  {
    eyebrow: "Pilots",
    title: "Your licence, always current",
    body: "SACAA-verified credentials, expiry reminders on WhatsApp and a digital logbook.",
    cta: "Open crew wallet",
    href: "/wallet",
  },
];

export function PortalCtas() {
  return (
    <motion.ul
      variants={staggerContainer(0.12)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3"
    >
      {PORTALS.map((p) => (
        <motion.li key={p.href} variants={flightCardVariant} whileHover="hover" whileTap="tap" onMouseMove={trackSpotlight} className="list-none">
          <motion.div variants={jetCardHover} className="glass spotlight h-full rounded-3xl">
            <Link href={p.href} className="flex h-full flex-col rounded-3xl p-8 focus-visible:outline-2 focus-visible:outline-gold-light">
              <p className="text-xs uppercase tracking-[0.3em] text-gold">{p.eyebrow}</p>
              <h3 className="mt-3 font-display text-3xl text-ivory">{p.title}</h3>
              <p className="mt-3 flex-1 text-slate-tac">{p.body}</p>
              <span className="mt-8 text-sm font-semibold text-gold-light">{p.cta} →</span>
            </Link>
          </motion.div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
