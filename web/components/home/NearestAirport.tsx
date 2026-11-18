"use client";

import { useState } from "react";
import Link from "next/link";
import { formatKm, isValidCoordinates, nearestAirfield, type AirfieldOption } from "@/lib/geo";

type Found = { icao: string; name: string; city: string; km: number };

const FAILED: Record<number, string> = {
  1: "Location access was blocked. Pick your airfield from the list above instead.",
  2: "We couldn't work out where you are right now. Pick your airfield from the list above.",
  3: "Finding your location took too long. Try again, or pick from the list above.",
};

/**
 * Homepage: the major airports we serve, and a "Detect yours" button that finds the airfield nearest the visitor.
 * That becomes their home airfield at sign-up, which is how crew requests near them reach them. The position is used in
 * the browser only; it is never sent to the server.
 */
export function NearestAirport({ majors, airfields }: { majors: AirfieldOption[]; airfields: AirfieldOption[] }) {
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function detect() {
    if (!("geolocation" in navigator)) return setProblem("This browser can't share your location. Pick your airfield from the list above.");
    setBusy(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        const here = { lat: coords.latitude, lng: coords.longitude };
        const n = isValidCoordinates(here) ? nearestAirfield(here, airfields) : null;
        if (!n) return setProblem("We couldn't match your location to an airfield. Pick yours from the list above.");
        setFound({ icao: n.icao, name: n.name, city: n.city, km: n.distanceKm });
      },
      (err) => {
        setBusy(false);
        setProblem(FAILED[err.code] ?? FAILED[2]);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }

  const join = (icao: string) => `/auth/signup?role=pilot&home=${icao}`;

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {majors.map((a) => (
          <li key={a.icao}>
            <Link href={join(a.icao)} className="glass flex h-full flex-col rounded-2xl p-4 transition hover:border-gold/40 pointer-coarse:min-h-11">
              <span className="font-mono text-lg text-gold-light">{a.icao}</span>
              <span className="mt-1 text-sm text-ivory">{a.name}</span>
              <span className="text-xs text-slate-tac">{a.city}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-3xl border border-gold/30 p-5" aria-live="polite">
        {found ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ivory">
              Your nearest airfield is <span className="font-mono text-gold-light">{found.icao}</span> · {found.name}, {found.city}
              <span className="text-slate-tac"> ({formatKm(found.km)} away)</span>
            </p>
            <Link href={join(found.icao)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light">
              Find flying near {found.icao}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-tac">Not sure which is closest? We&apos;ll find the airfield nearest you, so crew requests near home reach you first.</p>
            <button type="button" onClick={detect} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
              {busy ? "Finding you…" : "Detect yours"}
            </button>
          </div>
        )}
        {problem && <p className="mt-3 text-sm text-warn">{problem}</p>}
      </div>
    </div>
  );
}
