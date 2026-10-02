"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatKm, isValidCoordinates, nearestAirfield, type AirfieldOption } from "@/lib/geo";
import { AirfieldAutocomplete } from "./AirfieldAutocomplete";

interface Props {
  airfields: readonly AirfieldOption[];
  value: string;
  onChange: (icao: string) => void;
  label?: string;
  required?: boolean;
  name?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "found"; icao: string; distanceKm: number }
  | { kind: "problem"; message: string };

const MESSAGES: Record<number, string> = {
  1: "Location access was blocked, so we can't suggest your nearest airfield. Search for one below instead.",
  2: "We couldn't work out your position right now. Search for an airfield below instead.",
  3: "Finding your location took too long. Try again, or search for an airfield below.",
};

/**
 * Departure-airfield picker. "Detect my location" asks the browser for a position, selects the nearest airfield
 * and shows how far away it is. The manual search is always available, and is the fallback if the user declines.
 * Coordinates are used in the browser only; they are never sent to the server.
 */
export function NearestAirfieldPicker({ airfields, value, onChange, label = "Departing from", required, name }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function detect() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "problem", message: "This browser can't share your location. Search for an airfield below instead." });
      return;
    }
    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude };
        const nearest = isValidCoordinates(here) ? nearestAirfield(here, airfields) : null;
        if (!nearest) {
          setStatus({ kind: "problem", message: "No airfields are available to compare against." });
          return;
        }
        onChange(nearest.icao);
        setStatus({ kind: "found", icao: nearest.icao, distanceKm: nearest.distanceKm });
      },
      (err) => setStatus({ kind: "problem", message: MESSAGES[err.code] ?? MESSAGES[2] }),
      // maximumAge 0: this is a deliberate button press, so always take a fresh reading rather than a cached one.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }

  const found = status.kind === "found" ? airfields.find((a) => a.icao === status.icao) : undefined;
  const chosenSomethingElse = status.kind === "found" && value !== status.icao;

  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <AirfieldAutocomplete airfields={airfields} value={value} onChange={onChange} label={label} required={required} name={name} />
        </div>
        <button
          type="button"
          onClick={detect}
          disabled={status.kind === "locating"}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-gold/40 px-4 py-3 text-sm font-medium text-gold-light transition hover:bg-gold/10 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 fill-none stroke-current stroke-2 ${status.kind === "locating" ? "animate-spin" : ""}`} aria-hidden>
            {status.kind === "locating" ? <path d="M12 3a9 9 0 1 0 9 9" /> : <path d="M12 2v3m0 14v3M2 12h3m14 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />}
          </svg>
          {status.kind === "locating" ? "Locating…" : "Detect my location"}
        </button>
      </div>

      <div aria-live="polite" className="min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          {found && status.kind === "found" && (
            <motion.p
              key="found"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-full border border-emerald-status/30 bg-emerald-status/10 px-4 py-1.5 text-sm text-emerald-status"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-status" aria-hidden />
              <span>
                Closest airport: <strong className="font-semibold">{found.name} ({found.icao})</strong> — {formatKm(status.distanceKm)} away
              </span>
              {chosenSomethingElse && <span className="text-xs text-slate-tac">(you chose a different airfield)</span>}
            </motion.p>
          )}
          {status.kind === "problem" && (
            <motion.p key="problem" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-tac">
              {status.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
