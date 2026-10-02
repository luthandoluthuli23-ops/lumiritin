"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { flightCardVariant, jetCardHover, staggerContainer, trackSpotlight } from "@/lib/animations";
import { AIRCRAFT_CLASSES, MAX_MULTI_LEGS, computeQuote, legDistanceNm, type AircraftClassId, type AircraftClassSpec, type QuoteResult } from "@/lib/charter";
import { formatZar } from "@/lib/empty-legs-shared";
import type { AirfieldOption } from "@/lib/geo";
import { AirfieldAutocomplete } from "./AirfieldAutocomplete";
import { NearestAirfieldPicker } from "./NearestAirfieldPicker";
import { FormError, TextField, apiErrorMessage, ghostBtn, inputCls, primaryBtn } from "@/components/ui/Field";

type TripType = "ONE_WAY" | "ROUND_TRIP" | "MULTI_LEG";
const TRIP_TYPES: { id: TripType; label: string }[] = [
  { id: "ONE_WAY", label: "One-way" },
  { id: "ROUND_TRIP", label: "Round-trip" },
  { id: "MULTI_LEG", label: "Multi-leg" },
];

interface Stop {
  to: string;
  date: string;
}
interface Leg {
  from: string;
  to: string;
  date: string;
}

interface Props {
  airfields: AirfieldOption[];
  today: string; // YYYY-MM-DD in SAST
  initial: { from: string; to: string; date: string; pax: number };
  contact: { name: string; email: string; phone: string };
}

const itemVariants = flightCardVariant;
const container = staggerContainer(0.06, 0.05);

export function CharterConfigurator({ airfields, today, initial, contact }: Props) {
  const [tripType, setTripType] = useState<TripType>("ONE_WAY");
  const [origin, setOrigin] = useState(initial.from);
  const [stops, setStops] = useState<Stop[]>([{ to: initial.to, date: initial.date }]);
  const [returnDate, setReturnDate] = useState("");
  const [pax, setPax] = useState(initial.pax);
  const [classId, setClassId] = useState<AircraftClassId>("LIGHT_JET");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ reference: string; priceZar: number } | null>(null);

  const byIcao = useMemo(() => new Map(airfields.map((a) => [a.icao, a])), [airfields]);

  // Legs implied by the trip type. Each leg departs from where the previous one landed.
  const legs: Leg[] = useMemo(() => {
    const chain = stops.map((s, i) => ({ from: i === 0 ? origin : stops[i - 1].to, to: s.to, date: s.date }));
    if (tripType === "ONE_WAY") return chain.slice(0, 1);
    if (tripType === "ROUND_TRIP") return [chain[0], { from: chain[0].to, to: origin, date: returnDate }];
    return chain;
  }, [tripType, origin, stops, returnDate]);

  const routeComplete = legs.every((l) => l.from && l.to && l.date && l.from !== l.to) && legs.every((l, i) => i === 0 || l.date >= legs[i - 1].date);
  const distances = useMemo(
    () => (routeComplete ? legs.map((l) => legDistanceNm(byIcao.get(l.from)!, byIcao.get(l.to)!)) : null),
    [routeComplete, legs, byIcao],
  );
  const results = useMemo(() => {
    const m = new Map<AircraftClassId, QuoteResult | null>();
    for (const c of AIRCRAFT_CLASSES) m.set(c.id, distances ? computeQuote(distances, c, pax) : null);
    return m;
  }, [distances, pax]);

  const spec = AIRCRAFT_CLASSES.find((c) => c.id === classId)!;
  const current = results.get(classId) ?? null;

  function changeTrip(t: TripType) {
    setTripType(t);
    if (t === "MULTI_LEG" && stops.length < 2) setStops((s) => [...s, { to: "", date: s[0]?.date ?? "" }]);
  }
  const setStop = (i: number, patch: Partial<Stop>) => setStops((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!routeComplete || current?.ok !== true) return setError("Complete the route and choose an aircraft class that fits your trip.");
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/charter/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripType,
          aircraftClass: classId,
          passengers: pax,
          legs: legs.map((l) => ({ fromIcao: l.from, toIcao: l.to, date: l.date })),
          contactName: f.get("contactName"),
          contactEmail: f.get("contactEmail"),
          contactPhone: f.get("contactPhone"),
          notes: f.get("notes"),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data?.detail as string | undefined;
        return setError(detail ?? apiErrorMessage(data));
      }
      setBooked({ reference: data.reference, priceZar: data.quote.priceZar });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (booked) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass mx-auto max-w-2xl rounded-3xl p-10 text-center shadow-gold">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-status/15 text-emerald-status">
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Charter request received</p>
        <h2 className="mt-3 font-mono text-4xl tracking-wider text-gold-gradient">{booked.reference}</h2>
        <p className="mx-auto mt-4 max-w-md text-slate-tac">
          Estimated {formatZar(booked.priceZar)} excluding VAT and airport fees. An operator will confirm availability and a firm price. Nothing has been charged.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/dashboard/bookings" className={primaryBtn}>View my requests</Link>
          <button type="button" onClick={() => setBooked(null)} className={ghostBtn}>Plan another trip</button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-10">
        {/* 1. Trip */}
        <section aria-labelledby="s-trip">
          <h2 id="s-trip" className="mb-4 font-display text-3xl text-ivory"><span className="text-gold">01</span> Your trip</h2>
          <div role="tablist" aria-label="Trip type" className="relative inline-flex gap-1 rounded-2xl bg-obsidian-800 p-1">
            {TRIP_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tripType === t.id}
                onClick={() => changeTrip(t.id)}
                className={`relative rounded-xl px-5 py-2 text-sm font-medium transition-colors ${tripType === t.id ? "text-obsidian" : "text-slate-tac hover:text-ivory"}`}
              >
                {tripType === t.id && <motion.span layoutId="trip-pill" className="absolute inset-0 rounded-xl bg-gold" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="glass mt-5 space-y-5 rounded-3xl p-6">
            <NearestAirfieldPicker airfields={airfields} value={origin} onChange={setOrigin} label="Departing from" required />

            <AnimatePresence initial={false}>
              {stops.map((s, i) => {
                if (tripType !== "MULTI_LEG" && i > 0) return null;
                const from = i === 0 ? origin : stops[i - 1].to;
                return (
                  <motion.div key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                    <AirfieldAutocomplete
                      airfields={airfields}
                      value={s.to}
                      onChange={(to) => setStop(i, { to })}
                      label={tripType === "MULTI_LEG" ? `Leg ${i + 1}: ${from || "…"} to` : "Flying to"}
                      exclude={from ? [from] : []}
                      required
                    />
                    <label className="block">
                      <span className="text-xs uppercase tracking-widest text-slate-tac">{tripType === "ROUND_TRIP" ? "Outbound date" : "Date"}</span>
                      <input type="date" required min={i === 0 ? today : stops[i - 1].date || today} value={s.date} onChange={(e) => setStop(i, { date: e.target.value })} className={inputCls} />
                    </label>
                    {tripType === "MULTI_LEG" && stops.length > 2 && (
                      <button type="button" onClick={() => setStops((x) => x.filter((_, j) => j !== i))} aria-label={`Remove leg ${i + 1}`} className="mb-1 rounded-full p-3 text-slate-tac hover:bg-white/10 hover:text-alert">×</button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {tripType === "ROUND_TRIP" && (
              <label className="block max-w-[12rem]">
                <span className="text-xs uppercase tracking-widest text-slate-tac">Return date</span>
                <input type="date" required min={stops[0].date || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputCls} />
              </label>
            )}
            {tripType === "MULTI_LEG" && stops.length < MAX_MULTI_LEGS && (
              <button type="button" onClick={() => setStops((s) => [...s, { to: "", date: s[s.length - 1].date }])} className="text-sm font-medium text-gold-light underline underline-offset-4">
                + Add another leg
              </button>
            )}

            <div>
              <span className="text-xs uppercase tracking-widest text-slate-tac">Passengers</span>
              <div className="mt-2 flex items-center gap-4">
                <Stepper label="Fewer passengers" disabled={pax <= 1} onClick={() => setPax((p) => p - 1)}>−</Stepper>
                <output className="w-8 text-center font-display text-2xl text-ivory" aria-live="polite">{pax}</output>
                <Stepper label="More passengers" disabled={pax >= 12} onClick={() => setPax((p) => p + 1)}>+</Stepper>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Aircraft class */}
        <section aria-labelledby="s-class">
          <h2 id="s-class" className="mb-4 font-display text-3xl text-ivory"><span className="text-gold">02</span> Aircraft class</h2>
          <motion.div variants={container} initial="hidden" animate="show" role="radiogroup" aria-label="Aircraft class" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {AIRCRAFT_CLASSES.map((c) => (
              <ClassCard key={c.id} spec={c} selected={classId === c.id} result={results.get(c.id) ?? null} pax={pax} onSelect={() => setClassId(c.id)} />
            ))}
          </motion.div>
        </section>

        {/* 3. Contact */}
        <section aria-labelledby="s-contact">
          <h2 id="s-contact" className="mb-4 font-display text-3xl text-ivory"><span className="text-gold">03</span> Who should we contact?</h2>
          <div className="glass grid gap-5 rounded-3xl p-6 sm:grid-cols-2">
            <TextField label="Full name" name="contactName" defaultValue={contact.name} required autoComplete="name" />
            <TextField label="Email" name="contactEmail" type="email" defaultValue={contact.email} required autoComplete="email" />
            <TextField label="Phone (optional)" name="contactPhone" type="tel" defaultValue={contact.phone} autoComplete="tel" />
            <TextField label="Notes (optional)" name="notes" maxLength={1000} placeholder="Catering, luggage, pets…" />
          </div>
        </section>
      </div>

      {/* Quote panel */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="glass rounded-3xl p-6 shadow-gold">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Estimated quote</p>
          <AnimatePresence mode="wait" initial={false}>
            {current?.ok ? (
              <motion.div key="quote" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="mt-3 font-display text-5xl text-gold-gradient">{formatZar(current.quote.priceZar)}</p>
                <p className="mt-1 text-xs text-slate-tac">{spec.label} · excl. VAT, airport &amp; handling fees</p>
                <ul className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
                  {legs.map((l, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3">
                      <span className="text-ivory">{l.from} → {l.to}</span>
                      <span className="text-slate-tac">{current.quote.legs[i].distanceNm} nm · {current.quote.legs[i].billedHours.toFixed(1)} h</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex justify-between border-t border-white/10 pt-3 text-sm text-slate-tac">
                  <span>Total</span>
                  <span>{current.quote.totalDistanceNm} nm · {current.quote.totalBilledHours.toFixed(1)} billed h</span>
                </p>
              </motion.div>
            ) : (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-sm text-slate-tac">
                {current && !current.ok ? current.detail : "Choose where you're flying from and to, and a date, to see an instant estimate."}
              </motion.p>
            )}
          </AnimatePresence>

          <p className="mt-5 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-slate-tac">
            Indicative only, based on great-circle distance and typical class speeds. Operators confirm the final price and aircraft.
          </p>

          <div className="mt-5 space-y-3">
            <FormError message={error} />
            <button type="submit" disabled={busy || current?.ok !== true} className={`${primaryBtn} w-full`}>
              {busy ? "Sending…" : "Request this charter"}
            </button>
          </div>
        </div>
      </aside>
    </form>
  );
}

function ClassCard({ spec, selected, result, pax, onSelect }: { spec: AircraftClassSpec; selected: boolean; result: QuoteResult | null; pax: number; onSelect: () => void }) {
  const blocked = pax > spec.maxPax ? `Seats up to ${spec.maxPax}` : result && !result.ok && result.reason === "range_exceeded" ? "Beyond range for this route" : null;
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={blocked ? true : undefined}
      onClick={() => !blocked && onSelect()}
      onMouseMove={trackSpotlight}
      variants={itemVariants}
      whileHover={blocked ? undefined : "hover"}
      whileTap={blocked ? undefined : "tap"}
      className={`spotlight text-left ${blocked ? "cursor-not-allowed opacity-45" : ""}`}
    >
      <motion.div variants={jetCardHover} className={`glass h-full rounded-3xl p-5 transition-colors ${selected ? "border-gold/70 bg-gold/10 shadow-gold" : ""}`}>
        <div className="flex items-start justify-between">
          <h3 className="font-display text-2xl text-ivory">{spec.label}</h3>
          <span className={`mt-1 h-4 w-4 rounded-full border-2 ${selected ? "border-gold bg-gold" : "border-white/30"}`} aria-hidden />
        </div>
        <p className="mt-1 text-xs text-slate-tac">{spec.examples}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Spec label="Pax" value={`${spec.maxPax}`} />
          <Spec label="Cruise" value={`${spec.cruiseKts} kt`} />
          <Spec label="Range" value={`${spec.rangeNm.toLocaleString("en-ZA")} nm`} />
        </dl>
        <p className="mt-4 text-sm text-gold-light">{blocked ?? (result?.ok ? `≈ ${formatZar(result.quote.priceZar)}` : "Select a route for a price")}</p>
      </motion.div>
    </motion.button>
  );
}

const Spec = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-white/5 px-2 py-2">
    <dd className="text-sm font-medium text-ivory">{value}</dd>
    <dt className="text-[10px] uppercase tracking-widest text-slate-tac">{label}</dt>
  </div>
);

function Stepper({ label, children, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} {...props} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-xl text-ivory transition hover:border-gold/60 disabled:opacity-30">
      {children}
    </button>
  );
}
