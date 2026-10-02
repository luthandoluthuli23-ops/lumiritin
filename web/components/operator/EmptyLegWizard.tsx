"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_LUXE } from "@/lib/animations";
import { classForType, computeQuote, legDistanceNm } from "@/lib/charter";
import { MAX_DISCOUNT_PERCENT, aircraftName, formatZar, formatWindow } from "@/lib/empty-legs-shared";
import type { AirfieldOption } from "@/lib/geo";
import { nowSastLocal, sastLocalToIso } from "@/lib/sast";
import { AirfieldAutocomplete } from "@/components/charter/AirfieldAutocomplete";
import { FormError, Field, apiErrorMessage, ghostBtn, inputCls, primaryBtn } from "@/components/ui/Field";

interface AircraftOption {
  id: string;
  registration: string;
  type: string;
  seats: number;
  base: string;
  hourlyRateZar: number | null;
}

const STEPS = ["Aircraft", "Route", "Window & seats", "Pricing", "Review"] as const;

export function EmptyLegWizard({ airfields, aircraft }: { airfields: AirfieldOption[]; aircraft: AircraftOption[] }) {
  const [step, setStep] = useState(0);
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? "");
  const [origin, setOrigin] = useState(aircraft[0]?.base ?? "");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [seats, setSeats] = useState(aircraft[0]?.seats ?? 1);
  const [standard, setStandard] = useState("");
  const [discount, setDiscount] = useState(40);
  const [minNow, setMinNow] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  useEffect(() => setMinNow(nowSastLocal()), []);

  const ac = aircraft.find((a) => a.id === aircraftId)!;
  const byIcao = useMemo(() => new Map(airfields.map((a) => [a.icao, a])), [airfields]);
  const standardNum = Number(standard) || 0;
  const discounted = Math.round((standardNum * (1 - discount / 100)) / 10) * 10;

  // Suggestion: the aircraft's own hourly rate over this route, split across its seats.
  const suggestion = useMemo(() => {
    const a = byIcao.get(origin);
    const b = byIcao.get(destination);
    if (!ac.hourlyRateZar || !a || !b) return null;
    const nm = legDistanceNm(a, b);
    const r = computeQuote([nm], classForType(ac.type), 1);
    const hours = r.ok ? r.quote.totalBilledHours : Math.max(1, nm / 400 + 0.3);
    return { nm, perSeat: Math.round((hours * ac.hourlyRateZar) / ac.seats / 100) * 100 };
  }, [ac, byIcao, origin, destination]);

  function pickAircraft(id: string) {
    const next = aircraft.find((a) => a.id === id)!;
    setAircraftId(id);
    setOrigin(next.base);
    setSeats(next.seats);
  }

  /** Returns a problem with the current step, or null if it can proceed. */
  function problem(): string | null {
    if (step === 1) {
      if (!origin || !destination) return "Choose both airfields.";
      if (origin === destination) return "Origin and destination must differ.";
    }
    if (step === 2) {
      if (!start || !end) return "Set the earliest and latest departure.";
      if (new Date(sastLocalToIso(start)).getTime() <= Date.now()) return "The earliest departure must be in the future.";
      if (new Date(sastLocalToIso(end)) <= new Date(sastLocalToIso(start))) return "The latest departure must be after the earliest.";
      if (seats < 1 || seats > ac.seats) return `Seats must be between 1 and ${ac.seats}.`;
    }
    if (step === 3 && standardNum < 100) return "Enter the standard price per seat.";
    return null;
  }

  function next() {
    const p = problem();
    setError(p);
    if (!p) setStep((s) => s + 1);
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/empty-legs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aircraftId,
          originIcao: origin,
          destinationIcao: destination,
          departureStart: sastLocalToIso(start),
          departureEnd: sastLocalToIso(end),
          seatsOffered: seats,
          standardPricePerSeatZar: standardNum,
          discountedPricePerSeatZar: discounted,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error === "aircraft_already_scheduled_in_window" ? "This aircraft already has an empty leg in that window." : apiErrorMessage(data));
        return;
      }
      setPublished(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (published) {
    return (
      <div className="glass mx-auto max-w-xl rounded-3xl p-10 text-center shadow-gold">
        <h2 className="font-display text-4xl text-ivory">Published</h2>
        <p className="mt-3 text-slate-tac">{origin} → {destination} is now live on the empty-leg marketplace.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/empty-legs" className={primaryBtn}>View marketplace</Link>
          <button type="button" onClick={() => { setPublished(false); setStep(0); setDestination(""); setStart(""); setEnd(""); setStandard(""); }} className={ghostBtn}>Publish another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass max-w-3xl rounded-3xl p-6 sm:p-8">
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i <= step ? "bg-gold text-obsidian" : "bg-white/10 text-slate-tac"}`}>{i + 1}</span>
            <span className={`hidden text-xs sm:block ${i === step ? "text-ivory" : "text-slate-tac"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? "bg-gold/60" : "bg-white/10"}`} />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_LUXE } }} exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }} className="min-h-72 space-y-5">
          {step === 0 && (
            <div role="radiogroup" aria-label="Aircraft" className="grid gap-3 sm:grid-cols-2">
              {aircraft.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={a.id === aircraftId} onClick={() => pickAircraft(a.id)} className={`rounded-2xl border p-4 text-left transition ${a.id === aircraftId ? "border-gold/70 bg-gold/10" : "border-white/10 hover:border-white/25"}`}>
                  <p className="font-mono text-xl tracking-wider text-gold-light">{a.registration}</p>
                  <p className="text-sm text-ivory">{aircraftName(a.type)}</p>
                  <p className="text-xs text-slate-tac">{a.seats} seats · based {a.base || "—"}</p>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <>
              <AirfieldAutocomplete airfields={airfields} value={origin} onChange={setOrigin} label="Repositioning from" required />
              <AirfieldAutocomplete airfields={airfields} value={destination} onChange={setDestination} label="Repositioning to" exclude={origin ? [origin] : []} required />
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Earliest departure (SAST)"><input type="datetime-local" min={minNow} value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
                <Field label="Latest departure (SAST)"><input type="datetime-local" min={start || minNow} value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label={`Seats to sell (max ${ac.seats})`}>
                <input type="number" min={1} max={ac.seats} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className={inputCls} />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Standard price per seat (ZAR)" hint={suggestion ? `${suggestion.nm} nm. Suggested from your hourly rate: ${formatZar(suggestion.perSeat)} per seat.` : "The normal charter price per seat for this route."}>
                <div className="flex gap-3">
                  <input type="number" min={100} step={100} value={standard} onChange={(e) => setStandard(e.target.value)} className={inputCls} />
                  {suggestion && <button type="button" onClick={() => setStandard(String(suggestion.perSeat))} className={`${ghostBtn} mt-2 shrink-0`}>Use suggestion</button>}
                </div>
              </Field>
              <Field label={`Discount: ${discount}%`} hint={`Up to ${MAX_DISCOUNT_PERCENT}% off standard rates.`}>
                <input type="range" min={10} max={MAX_DISCOUNT_PERCENT} step={5} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="mt-3 w-full accent-[#d4af37]" />
              </Field>
              <p className="rounded-2xl bg-white/5 p-4 text-sm text-slate-tac">
                Passengers pay <span className="font-display text-2xl text-gold-gradient">{standardNum ? formatZar(discounted) : "—"}</span> per seat
                {standardNum ? <span className="ml-2 line-through">{formatZar(standardNum)}</span> : null}
              </p>
            </>
          )}

          {step === 4 && (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Row label="Aircraft" value={`${ac.registration} · ${aircraftName(ac.type)}`} />
              <Row label="Route" value={`${origin} → ${destination}`} />
              <Row label="Departure window" value={formatWindow(sastLocalToIso(start), sastLocalToIso(end))} />
              <Row label="Seats" value={`${seats} of ${ac.seats}`} />
              <Row label="Price per seat" value={`${formatZar(discounted)} (was ${formatZar(standardNum)}, −${discount}%)`} />
              <Row label="Potential revenue" value={formatZar(discounted * seats)} />
            </dl>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 space-y-4">
        <FormError message={error} />
        <div className="flex justify-between">
          <button type="button" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={step === 0 || busy} className={ghostBtn}>Back</button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className={primaryBtn}>Continue</button>
          ) : (
            <button type="button" onClick={publish} disabled={busy} className={primaryBtn}>{busy ? "Publishing…" : "Publish empty leg"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-white/5 p-4">
    <dt className="text-xs uppercase tracking-widest text-slate-tac">{label}</dt>
    <dd className="mt-1 text-ivory">{value}</dd>
  </div>
);
