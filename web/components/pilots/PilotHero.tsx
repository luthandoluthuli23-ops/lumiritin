"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { createHeroTimeline } from "@/lib/animations";

const RADAR = { x: 820, y: 350 };
const RINGS = [110, 210, 310, 420];

// The copy renders visible on first paint (no "hidden until JS" state); only the radar/flight-path art animates.
export function PilotHero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!root.current) return;
    const ctx = createHeroTimeline(root.current, `${RADAR.x} ${RADAR.y}`);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="relative flex min-h-[80vh] items-center overflow-hidden px-6 pb-24 pt-28">
      {/* Radar + trajectory */}
      <svg aria-hidden viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0H0V60" fill="none" stroke="#d4af37" strokeOpacity="0.06" />
          </pattern>
          <linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="1240" y1="350" x2="1164" y2="109">
            <stop offset="0" stopColor="#e2b857" stopOpacity="0.45" />
            <stop offset="1" stopColor="#e2b857" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="vignette" cx="68%" cy="50%" r="70%">
            <stop offset="0.3" stopColor="#0b0f17" stopOpacity="0" />
            <stop offset="1" stopColor="#0b0f17" stopOpacity="1" />
          </radialGradient>
        </defs>

        <rect width="1200" height="700" fill="url(#grid)" />
        {RINGS.map((r) => (
          <circle key={r} data-radar-ring cx={RADAR.x} cy={RADAR.y} r={r} fill="none" stroke="#d4af37" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 6" />
        ))}
        <path d={`M${RADAR.x - 420} ${RADAR.y}H${RADAR.x + 420}M${RADAR.x} ${RADAR.y - 420}V${RADAR.y + 420}`} stroke="#d4af37" strokeOpacity="0.12" />
        <path data-radar-sweep d={`M${RADAR.x} ${RADAR.y} L1240 350 A420 420 0 0 0 1164 109.1 Z`} fill="url(#sweep)" />
        {/* Starts right of the copy column so the line never crosses the headline or buttons. */}
        <path data-flightpath d="M650 520 C 790 500, 830 280, 1040 200" fill="none" stroke="#e2b857" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="650" cy="520" r="4" fill="#e2b857" />
        <circle cx="1040" cy="200" r="4" fill="#e2b857" />
        <g data-plane>
          <path d="M14 0 L-9 -8 L-4 0 L-9 8 Z" fill="#f6e3a8" />
        </g>
        <rect width="1200" height="700" fill="url(#vignette)" />
      </svg>

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">The pilot wallet</p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.04] text-ivory sm:text-7xl">
          Your licence, medical and logbook <span className="text-gold-gradient">in one place.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-slate-tac">
          We warn you on WhatsApp before anything expires. Free for pilots, always.
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link href="/auth/signup?role=pilot" className="inline-flex min-h-11 items-center rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
            Create your free wallet
          </Link>
          <Link href="/auth/signin" className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-ivory transition hover:border-gold/60">
            Sign in
          </Link>
        </div>
        <TrustLine className="mt-10" />
      </div>
    </section>
  );
}

/** The one verification claim the site makes, worded exactly, linked to how it works. */
export function TrustLine({ className = "" }: { className?: string }) {
  return (
    <p className={`max-w-xl text-sm text-slate-tac ${className}`}>
      <span className="text-ivory">Every crew profile checked against SACAA records.</span>{" "}
      <Link href="/verification" className="underline decoration-gold/50 underline-offset-4 transition hover:text-ivory">
        Each profile shows the date it was last verified.
      </Link>
    </p>
  );
}
