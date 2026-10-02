"use client";

import { motion } from "framer-motion";
import { flightCardVariant, jetCardHover, trackSpotlight } from "@/lib/animations";
import { airfieldCity } from "@/lib/airfields";
import { aircraftName, formatWindow, formatZar, type EmptyLegCard } from "@/lib/empty-legs-shared";

interface Props {
  leg: EmptyLegCard;
  onRequest: (leg: EmptyLegCard) => void;
}

export function FlightCard({ leg, onRequest }: Props) {
  const soldOut = leg.remainingSeats === 0;
  const lowSeats = !soldOut && leg.remainingSeats <= 2;

  return (
    <motion.li
      layout
      variants={flightCardVariant}
      exit="exit"
      whileHover="hover"
      whileTap="tap"
      onMouseMove={trackSpotlight}
      className="list-none"
    >
      <motion.article variants={jetCardHover} className="glass spotlight group relative overflow-hidden rounded-3xl p-6 shadow-gold">
        <span
          aria-label={`${leg.discountPercent} percent off`}
          className="absolute right-5 top-5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold tracking-wide text-gold-light"
        >
          −{leg.discountPercent}%
        </span>

        {/* Route */}
        <div className="flex items-center gap-4 pr-20">
          <Airport icao={leg.originIcao} />
          <div className="relative h-px flex-1 bg-gradient-to-r from-gold/70 via-gold/30 to-gold/70" aria-hidden>
            <svg viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rotate-90 fill-gold-light">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
            </svg>
          </div>
          <Airport icao={leg.destinationIcao} align="right" />
        </div>

        {/* Details */}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Detail label="Departure window" value={formatWindow(leg.departureStart, leg.departureEnd)} />
          <Detail label="Aircraft" value={`${aircraftName(leg.aircraftType)}`} sub={`${leg.aircraftRegistration} · ${leg.operatorName}`} />
        </dl>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-tac">Per seat</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="font-display text-3xl font-semibold text-gold-gradient">{formatZar(leg.discountedPricePerSeatZar)}</span>
              <span className="text-sm text-slate-tac line-through decoration-alert/70">{formatZar(leg.standardPricePerSeatZar)}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                soldOut
                  ? "bg-white/5 text-slate-tac"
                  : lowSeats
                    ? "bg-alert/15 text-alert"
                    : "bg-emerald-status/15 text-emerald-status"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${soldOut ? "bg-slate-tac" : lowSeats ? "bg-alert" : "bg-emerald-status"}`} />
              {soldOut ? "Sold out" : `${leg.remainingSeats} of ${leg.seatsOffered} seats left`}
            </span>
            <button
              type="button"
              disabled={soldOut}
              onClick={() => onRequest(leg)}
              className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-light disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-tac"
            >
              Request seats
            </button>
          </div>
        </div>
      </motion.article>
    </motion.li>
  );
}

function Airport({ icao, align = "left" }: { icao: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="font-display text-4xl font-semibold tracking-wider text-ivory">{icao}</p>
      <p className="text-xs uppercase tracking-widest text-slate-tac">{airfieldCity(icao) || "—"}</p>
    </div>
  );
}

function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-slate-tac">{label}</dt>
      <dd className="mt-1 text-ivory">{value}</dd>
      {sub && <dd className="text-xs text-slate-tac">{sub}</dd>}
    </div>
  );
}
