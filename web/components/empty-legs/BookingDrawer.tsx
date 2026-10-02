"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { drawerSlide, fade } from "@/lib/animations";
import { formatWindow, formatZar, type EmptyLegCard } from "@/lib/empty-legs-shared";

interface Props {
  leg: EmptyLegCard | null;
  onClose: () => void;
  onBooked: (legId: string, seats: number) => void;
}

type Phase = { kind: "form" } | { kind: "submitting" } | { kind: "done"; seats: number; totalZar: number } | { kind: "error"; message: string };

const ERRORS: Record<string, string> = {
  not_enough_seats: "Someone just booked some of these seats. Please reduce the number of seats.",
  leg_departed: "This flight has already departed.",
  leg_cancelled: "This flight is no longer available.",
  not_found: "This flight could not be found.",
};

export function BookingDrawer({ leg, onClose, onBooked }: Props) {
  return (
    <AnimatePresence>
      {leg && <DrawerBody key={leg.id} leg={leg} onClose={onClose} onBooked={onBooked} />}
    </AnimatePresence>
  );
}

function DrawerBody({ leg, onClose, onBooked }: { leg: EmptyLegCard; onClose: () => void; onBooked: Props["onBooked"] }) {
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [seats, setSeats] = useState(1);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const max = leg.remainingSeats;

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPhase({ kind: "submitting" });
    try {
      const res = await fetch(`/api/empty-legs/${leg.id}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passengerName: form.get("name"),
          passengerEmail: form.get("email"),
          passengerPhone: form.get("phone"),
          seats,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const issue = data.issues?.[0];
        setPhase({
          kind: "error",
          message: issue ? `${issue.path}: ${issue.message}` : (ERRORS[data.error] ?? "Something went wrong. Please try again."),
        });
        return;
      }
      setPhase({ kind: "done", seats: data.booking.seats, totalZar: data.totalZar });
      onBooked(leg.id, data.booking.seats);
    } catch {
      setPhase({ kind: "error", message: "Network error. Please try again." });
    }
  }

  const total = seats * leg.discountedPricePerSeatZar;
  const busy = phase.kind === "submitting";

  return (
    <>
      <motion.div variants={fade} initial="hidden" animate="show" exit="exit" onClick={onClose} className="fixed inset-0 z-50 bg-obsidian/70 backdrop-blur-sm" aria-hidden />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        variants={drawerSlide}
        initial="hidden"
        animate="show"
        exit="exit"
        className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-y-0 border-r-0 bg-obsidian-800/95 p-8"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-5 top-5 rounded-full p-2 text-slate-tac transition hover:bg-white/10 hover:text-ivory">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        {phase.kind === "done" ? (
          <div className="my-auto text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-status/15 text-emerald-status">
              <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-2"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 id={titleId} className="font-display text-3xl text-ivory">Request sent</h2>
            <p className="mt-3 text-slate-tac">
              {phase.seats} seat{phase.seats > 1 && "s"} on {leg.originIcao} → {leg.destinationIcao} are held for you while {leg.operatorName} confirms.
              Estimated total {formatZar(phase.totalZar)}. No payment has been taken.
            </p>
            <button type="button" onClick={onClose} className="mt-8 rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-obsidian hover:bg-gold-light">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-1 flex-col gap-5">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-gold">Request seats</p>
              <h2 id={titleId} className="mt-2 font-display text-4xl text-ivory">
                {leg.originIcao} <span className="text-gold">→</span> {leg.destinationIcao}
              </h2>
              <p className="mt-1 text-sm text-slate-tac">{formatWindow(leg.departureStart, leg.departureEnd)}</p>
            </header>

            <Field label="Full name" name="name" autoComplete="name" required inputRef={firstField} />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />

            <div>
              <span className="text-xs uppercase tracking-widest text-slate-tac">Seats</span>
              <div className="mt-2 flex items-center gap-4">
                <Step label="Fewer seats" disabled={seats <= 1} onClick={() => setSeats((s) => s - 1)}>−</Step>
                <output className="w-8 text-center font-display text-2xl text-ivory" aria-live="polite">{seats}</output>
                <Step label="More seats" disabled={seats >= max} onClick={() => setSeats((s) => s + 1)}>+</Step>
                <span className="text-xs text-slate-tac">{max} available</span>
              </div>
            </div>

            <div className="mt-auto border-t border-white/10 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-tac">{seats} × {formatZar(leg.discountedPricePerSeatZar)}</span>
                <span className="font-display text-3xl text-gold-gradient">{formatZar(total)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-tac">You save {formatZar(seats * (leg.standardPricePerSeatZar - leg.discountedPricePerSeatZar))} against the standard rate.</p>

              {phase.kind === "error" && (
                <p role="alert" className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{phase.message}</p>
              )}

              <button type="submit" disabled={busy} className="mt-4 w-full rounded-full bg-gold py-3 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
                {busy ? "Sending…" : "Send booking request"}
              </button>
              <p className="mt-3 text-center text-xs text-slate-tac">The operator confirms availability before anything is charged.</p>
            </div>
          </form>
        )}
      </motion.aside>
    </>
  );
}

function Field({ label, inputRef, ...props }: { label: string; inputRef?: React.Ref<HTMLInputElement> } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-tac">{label}</span>
      <input
        ref={inputRef}
        {...props}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10"
      />
    </label>
  );
}

function Step({ label, children, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} {...props} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-xl text-ivory transition hover:border-gold/60 disabled:opacity-30">
      {children}
    </button>
  );
}
