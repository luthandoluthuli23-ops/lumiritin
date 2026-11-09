"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormError, SelectField, apiErrorMessage, cardCls, ghostBtn, primaryBtn } from "@/components/ui/Field";

interface Props {
  state: "AVAILABLE" | "BOOKED" | "OFF";
  label: string;
  reason: string;
}

const STYLE = {
  AVAILABLE: { dot: "bg-emerald-status", text: "text-emerald-status", ring: "border-emerald-status/40" },
  BOOKED: { dot: "bg-gold", text: "text-gold-light", ring: "border-gold/40" },
  OFF: { dot: "bg-slate-tac", text: "text-slate-tac", ring: "border-white/15" },
} as const;

const dayFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long" });
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" });

/** "Until <weekday> 18:00 SAST" for each of the next 7 days whose 18:00 is still ahead. */
function untilOptions(now: Date): { value: string; label: string }[] {
  const presets = [4, 12, 24, 48].map((h) => ({ value: new Date(now.getTime() + h * 3_600_000).toISOString(), label: `For the next ${h} hours` }));
  const days: { value: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    const end = new Date(`${dateFmt.format(day)}T18:00:00+02:00`);
    if (end.getTime() > now.getTime() + 3_600_000) days.push({ value: end.toISOString(), label: `Until ${i === 0 ? "today" : dayFmt.format(day)} 18:00` });
  }
  return [...days.slice(0, 5), ...presets];
}

export function AvailabilityPanel({ state: initial, label: initialLabel, reason }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [label, setLabel] = useState(initialLabel);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => untilOptions(new Date()), []);
  const s = STYLE[state];

  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(apiErrorMessage(data));
      setState(data.state);
      setLabel(data.label);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${cardCls} border ${s.ring}`} aria-labelledby="avail-h">
      <h2 id="avail-h" className="font-display text-2xl text-ivory">Availability</h2>
      <p className={`mt-2 flex items-start gap-2 font-display text-2xl sm:text-3xl ${s.text}`} aria-live="polite">
        <span className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-3 ${s.dot}`} aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-tac">{state === "OFF" ? reason : "Operators only see you in crew shortlists while you are available."}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <SelectField label="Go available" value={until} onChange={(e) => setUntil(e.target.value)}>
          <option value="">Choose how long…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
        <button type="button" disabled={busy || !until} onClick={() => send({ mode: "available", until })} className={primaryBtn}>
          {state === "AVAILABLE" ? "Renew" : "Go available"}
        </button>
        <button type="button" disabled={busy || state !== "AVAILABLE"} onClick={() => send({ mode: "off" })} className={ghostBtn}>Go off</button>
        <p className="text-xs text-slate-tac sm:col-span-3">Availability always expires. Renew it to stay listed.</p>
      </div>
      <div className="mt-4 empty:hidden"><FormError message={error} /></div>
    </section>
  );
}
