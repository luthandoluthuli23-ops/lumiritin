import type { ReactNode } from "react";
import { labelSmCls } from "@/components/ui/Field";

export interface LogbookEntryDTO {
  id: string;
  date: string;
  departureIcao: string | null;
  arrivalIcao: string | null;
  aircraftType: string | null;
  aircraftReg: string | null;
  operatorName: string | null;
  totalHours: number;
  picHours: number | null;
  coPilotHours: number | null;
  dualHours: number | null;
  instructorHours: number | null;
  nightHours: number | null;
  instrumentHours: number | null;
  multiEngineHours: number | null;
  turbineHours: number | null;
  dayLandings: number;
  nightLandings: number;
  certifier: string | null;
  source: "PLATFORM" | "IMPORTED" | "MANUAL";
  verified: boolean;
  remarks: string | null;
  /** True when the row was pulled from an external logbook (MyFlightbook) and is refreshed on every sync. */
  external: boolean;
}

/** One decimal, South African formatting ("4 250,5"). */
export const h1 = (x: number) => x.toLocaleString("en-ZA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** Today's calendar date in the pilot's own time zone as YYYY-MM-DD (toISOString would give the UTC date, a day off near midnight). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Scrolls an element to the top of the screen below the fixed navbar, without animation for people who prefer reduced motion. */
export function scrollToPanel(el: HTMLElement | null) {
  el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

type ApiBody = { message?: string; issues?: { path?: string; message?: string }[] } | null;

/** The first validation message from an API error body ({ error: "validation_failed", issues }), else its message, else the fallback. */
export function issueMessage(d: ApiBody, fallback: string, labels: Record<string, string> = {}): string {
  const first = d?.issues?.[0];
  if (first?.message) {
    const label = first.path ? labels[first.path] : undefined;
    return label ? `${label}: ${first.message}` : first.message;
  }
  return d?.message ?? fallback;
}

/** Action bar pinned to the bottom of a long form's card while it scrolls, so Save is always one thumb away. Respects the home indicator. */
export const stickyBarCls =
  "sticky bottom-0 z-10 -mx-5 -mb-5 mt-6 flex flex-wrap items-center gap-3 rounded-b-3xl border-t border-white/10 bg-obsidian-800/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6";

/** Native file picker styled to match the buttons. 16px text on every screen and a 44px touch target. */
export const fileInputCls =
  "block w-full min-w-0 text-base text-slate-tac file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-white/10 file:px-5 file:py-3 file:text-sm file:font-semibold file:text-ivory hover:file:bg-white/15 pointer-coarse:min-h-11";

/** Label + control for dense grids (pair with inputSmCls). */
export function SmField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelSmCls}>{label}</span>
      {children}
    </label>
  );
}
