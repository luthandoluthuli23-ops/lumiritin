"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { heroTextReveal, staggerContainer } from "@/lib/animations";
import { AIRFIELDS, matchesAirfield } from "@/lib/airfields";
import { sastDate, type EmptyLegCard } from "@/lib/empty-legs-shared";
import { FlightCard } from "./FlightCard";
import { BookingDrawer } from "./BookingDrawer";

interface Props {
  legs: EmptyLegCard[];
  initial: { from: string; to: string; date: string };
}

const container = staggerContainer(0.09, 0.15);

export function EmptyLegBrowser({ legs: initialLegs, initial }: Props) {
  const [legs, setLegs] = useState(initialLegs);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [date, setDate] = useState(initial.date);
  const [selected, setSelected] = useState<EmptyLegCard | null>(null);

  const visible = useMemo(
    () =>
      legs.filter(
        (l) =>
          matchesAirfield(l.originIcao, from) &&
          matchesAirfield(l.destinationIcao, to) &&
          (!date || (sastDate(l.departureStart) <= date && date <= sastDate(l.departureEnd))),
      ),
    [legs, from, to, date],
  );

  const close = useCallback(() => setSelected(null), []);
  const onBooked = useCallback((id: string, seats: number) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, remainingSeats: Math.max(0, l.remainingSeats - seats) } : l)));
  }, []);

  const filtered = Boolean(from || to || date);
  const clear = () => {
    setFrom("");
    setTo("");
    setDate("");
  };

  return (
    <>
      <section className="relative overflow-hidden px-6 pb-10 pt-32">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold/10 blur-[120px]" />
        <div className="relative mx-auto max-w-7xl">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Empty leg deals</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] text-ivory sm:text-7xl">
            <span className="block overflow-hidden pb-2">
              <motion.span className="block" variants={heroTextReveal} initial="hidden" animate="show" custom={0}>
                Fly the repositioning leg.
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-2">
              <motion.span className="block text-gold-gradient" variants={heroTextReveal} initial="hidden" animate="show" custom={1}>
                Save up to 75%.
              </motion.span>
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-slate-tac">
            Private jets must return or reposition empty. Book the seats on those flights at a fraction of the charter rate.
          </p>

          {/* Search */}
          <form
            role="search"
            onSubmit={(e) => e.preventDefault()}
            className="glass mt-10 grid gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_14rem_auto]"
          >
            <SearchField label="Departing from" value={from} onChange={setFrom} placeholder="ICAO or city, e.g. FALA" list="airfield-options" />
            <SearchField label="Flying to" value={to} onChange={setTo} placeholder="ICAO or city, e.g. Cape Town" list="airfield-options" />
            <SearchField label="Date" type="date" value={date} onChange={setDate} />
            <button
              type="button"
              onClick={clear}
              disabled={!filtered}
              className="self-end rounded-xl border border-white/15 px-5 py-3 text-sm text-slate-tac transition hover:border-gold/50 hover:text-ivory disabled:opacity-30"
            >
              Clear
            </button>
            <datalist id="airfield-options">
              {Object.entries(AIRFIELDS).map(([icao, a]) => (
                <option key={icao} value={icao}>{`${a.city} — ${a.name}`}</option>
              ))}
            </datalist>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <p className="mb-6 text-sm text-slate-tac" aria-live="polite">
          {visible.length} {visible.length === 1 ? "flight" : "flights"}
          {filtered ? " match your search" : " available"}
        </p>

        {visible.length > 0 ? (
          <motion.ul variants={container} initial="hidden" animate="show" className="grid gap-6 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {visible.map((leg) => (
                <FlightCard key={leg.id} leg={leg} onRequest={setSelected} />
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <div className="glass rounded-3xl px-6 py-16 text-center">
            <p className="font-display text-3xl text-ivory">{legs.length === 0 ? "No empty legs published yet" : "No flights match"}</p>
            <p className="mt-2 text-slate-tac">
              {legs.length === 0 ? "Check back soon — operators publish new repositioning flights daily." : "Try a different airfield or date."}
            </p>
            {filtered && (
              <button type="button" onClick={clear} className="mt-6 text-sm text-gold-light underline underline-offset-4">
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      <BookingDrawer leg={selected} onClose={close} onBooked={onBooked} />
    </>
  );
}

function SearchField({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-tac">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10"
      />
    </label>
  );
}
