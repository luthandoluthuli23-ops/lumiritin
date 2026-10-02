"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { createHeroTimeline } from "@/lib/animations";

const RADAR = { x: 820, y: 350 };
const RINGS = [110, 210, 310, 420];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!root.current) return;
    const ctx = createHeroTimeline(root.current, `${RADAR.x} ${RADAR.y}`);
    return () => ctx.revert();
  }, []);

  return (
    // `hero-hidden` hides the copy until GSAP takes over (no flash before the timeline runs) and
    // reveals it after 3.5s anyway if JS never does. See globals.css.
    <section ref={root} className="hero-hidden relative flex min-h-[88vh] items-center overflow-hidden px-6 pb-40 pt-28">
      {/* Radar + trajectory */}
      <svg
        aria-hidden
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
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

        {/* Flight path */}
        {/* Starts right of the copy column so the line never crosses the headline or buttons. */}
        <path data-flightpath d="M650 520 C 790 500, 830 280, 1040 200" fill="none" stroke="#e2b857" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="650" cy="520" r="4" fill="#e2b857" />
        <circle cx="1040" cy="200" r="4" fill="#e2b857" />
        <text x="650" y="548" fill="#8b97ab" fontSize="13" letterSpacing="3">FACT</text>
        <text x="1010" y="180" fill="#8b97ab" fontSize="13" letterSpacing="3">FALA</text>
        <g data-plane>
          <path d="M14 0 L-9 -8 L-4 0 L-9 8 Z" fill="#f6e3a8" />
        </g>

        <rect width="1200" height="700" fill="url(#vignette)" />
      </svg>

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <p data-hero-fade className="text-xs uppercase tracking-[0.4em] text-gold">
          South Africa&rsquo;s private aviation network
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-6xl leading-[1.02] text-ivory sm:text-8xl">
          <span className="block overflow-hidden pb-2">
            <span data-hero-line className="block">The sky,</span>
          </span>
          <span className="block overflow-hidden pb-3">
            <span data-hero-line className="block text-gold-gradient">on your schedule.</span>
          </span>
        </h1>
        <p data-hero-fade className="mt-6 max-w-xl text-lg text-slate-tac">
          Charter a jet, take an empty leg for up to 75% off, or find SACAA-verified crew. One platform for passengers, operators and pilots.
        </p>
        <div data-hero-fade className="mt-9 flex flex-wrap gap-4">
          <Link href="/empty-legs" className="rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
            Browse empty legs
          </Link>
          <Link href="/charter" className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-ivory transition hover:border-gold/60">
            Request a charter quote
          </Link>
        </div>
      </div>
    </section>
  );
}
