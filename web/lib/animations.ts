// Animation toolkit. Client-only: import from "use client" components, never from server components.
//   • Framer Motion: declarative variants for React-owned UI (cards, lists, drawers).
//   • GSAP: imperative timelines for the hero (SVG flight path, radar sweep) and scroll counters.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Transition, Variants } from "framer-motion";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/** Slow-in, long-settle curve used everywhere so motion feels like one system. */
export const EASE_LUXE = [0.22, 1, 0.36, 1] as const;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Framer Motion variants ────────────────────────────────────────────────

/** Headline line reveal. Wrap each line in an `overflow-hidden` parent; pass `custom={lineIndex}`. */
export const heroTextReveal: Variants = {
  hidden: { y: "110%", opacity: 0 },
  show: (i: number = 0) => ({
    y: "0%",
    opacity: 1,
    transition: { duration: 1.0, ease: EASE_LUXE, delay: 0.15 + i * 0.12 },
  }),
};

/** Parent that staggers its `flightCardVariant` children. */
export const staggerContainer = (stagger = 0.09, delayChildren = 0.1): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

export const flightCardVariant: Variants = {
  hidden: { opacity: 0, y: 36, scale: 0.97, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_LUXE },
  },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.25 } },
};

const hoverSpring: Transition = { type: "spring", stiffness: 260, damping: 22 };

/** Spread onto a `motion.*` card: `whileHover="hover" whileTap="tap"` with `variants={jetCardHover}`. */
export const jetCardHover: Variants = {
  rest: { y: 0, transition: hoverSpring },
  hover: { y: -8, transition: hoverSpring },
  tap: { scale: 0.985, transition: { duration: 0.12 } },
};

/**
 * onMouseMove handler for `.spotlight` cards: feeds the cursor position to the CSS gold glow.
 * Combine with `jetCardHover` for the full luxury hover.
 */
export function trackSpotlight(e: ReactMouseEvent<HTMLElement>): void {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
}

export const drawerSlide: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: { duration: 0.5, ease: EASE_LUXE } },
  exit: { x: "100%", transition: { duration: 0.35, ease: EASE_LUXE } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

// ─── GSAP ──────────────────────────────────────────────────────────────────

/**
 * Hero intro timeline. Looks up elements by data attribute inside `root`:
 *   [data-hero-line]  headline lines (each inside an overflow-hidden wrapper)
 *   [data-hero-fade]  sub copy / CTAs
 *   [data-flightpath] <path> the trajectory is drawn along
 *   [data-plane]      <g> that flies along the path (positioned via getPointAtLength)
 *   [data-radar-sweep] <g> rotated forever around `radarOrigin` ("x y" in SVG user units)
 *   [data-radar-ring] concentric rings that pulse
 * Returns a gsap.Context: call `ctx.revert()` on unmount.
 */
export function createHeroTimeline(root: HTMLElement, radarOrigin = "820 350"): gsap.Context {
  return gsap.context(() => {
    const path = root.querySelector<SVGPathElement>("[data-flightpath]");
    const plane = root.querySelector<SVGGElement>("[data-plane]");
    const length = path?.getTotalLength() ?? 0;

    if (prefersReducedMotion()) {
      gsap.set("[data-hero-line], [data-hero-fade]", { opacity: 1, y: 0 });
      if (path) gsap.set(path, { strokeDasharray: "none" });
      if (plane && path) placePlane(path, plane, 0.62);
      return;
    }

    gsap.set("[data-hero-line]", { yPercent: 110, opacity: 0 });
    gsap.set("[data-hero-fade]", { y: 24, opacity: 0 });
    if (path) gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    if (plane) gsap.set(plane, { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
    tl.to("[data-hero-line]", { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.14 })
      .to("[data-hero-fade]", { y: 0, opacity: 1, duration: 0.9, stagger: 0.12 }, "-=0.6");

    if (path && plane) {
      const progress = { p: 0 };
      tl.to(path, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut" }, 0.4)
        .to(plane, { opacity: 1, duration: 0.3 }, 0.5)
        .to(
          progress,
          {
            p: 1,
            duration: 2.4,
            ease: "power2.inOut",
            onUpdate: () => placePlane(path, plane, progress.p),
          },
          0.4,
        );
    }

    // Radar sweep + pulsing rings run independently of the intro.
    gsap.to("[data-radar-sweep]", {
      rotation: 360,
      svgOrigin: radarOrigin,
      duration: 7,
      ease: "none",
      repeat: -1,
    });
    gsap.fromTo(
      "[data-radar-ring]",
      { opacity: 0.15 },
      { opacity: 0.55, duration: 2.4, stagger: 0.5, repeat: -1, yoyo: true, ease: "sine.inOut" },
    );
  }, root);
}

function placePlane(path: SVGPathElement, plane: SVGGElement, p: number): void {
  const len = path.getTotalLength();
  const at = Math.min(Math.max(p, 0), 1) * len;
  const pt = path.getPointAtLength(at);
  const ahead = path.getPointAtLength(Math.min(at + 1, len));
  const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
  plane.setAttribute("transform", `translate(${pt.x} ${pt.y}) rotate(${angle})`);
}

interface CounterOptions {
  decimals?: number;
  duration?: number;
}

/** Counts `el.textContent` from 0 up to `to` the first time it scrolls into view. Returns a cleanup. */
export function animateCounter(el: HTMLElement, to: number, { decimals = 0, duration = 1.8 }: CounterOptions = {}) {
  const format = (v: number) => v.toFixed(decimals);
  if (prefersReducedMotion()) {
    el.textContent = format(to);
    return () => {};
  }
  el.textContent = format(0);
  const state = { v: 0 };
  const tween = gsap.to(state, {
    v: to,
    duration,
    ease: "power3.out",
    paused: true,
    onUpdate: () => {
      el.textContent = format(state.v);
    },
  });
  const trigger = ScrollTrigger.create({
    trigger: el,
    start: "top 90%",
    once: true,
    onEnter: () => tween.play(),
  });
  return () => {
    trigger.kill();
    tween.kill();
  };
}
