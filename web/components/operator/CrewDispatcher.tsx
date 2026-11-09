"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { EASE_LUXE, flightCardVariant, staggerContainer } from "@/lib/animations";
import { AIRCRAFT_TYPES, formatWindow } from "@/lib/empty-legs-shared";
import type { AirfieldOption } from "@/lib/geo";
import { Alert } from "@/components/ui/Alert";
import { FormError, SelectField, apiErrorMessage, cardCls, ghostBtn, primaryBtn } from "@/components/ui/Field";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { standaloneLinkCls } from "@/components/operator/styles";

interface Badge { label: string; value: string; ok: boolean }
interface ScoreLine { criterion: string; points: number; max: number; detail: string }
interface Match { personId: string; name: string; score: number; distanceKm: number | null; badges: Badge[]; breakdown: ScoreLine[]; pool: string }
interface Shortlist {
  shortlist: Match[];
  eligibleCount: number;
  benchCount: number;
  excludedCount: number;
  excludedByReason: { code: string; label: string; count: number }[];
}
interface PingRow { rank: number; personId: string; name: string; status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED"; secondsLeft: number; whatsappSent: boolean }
interface Status { status: "OPEN" | "FILLED" | "CANCELLED"; dispatched: boolean; assignedPersonId: string | null; pings: PingRow[] }

const ROLES: [string, string][] = [["PILOT", "Pilot"], ["CABIN_CREW", "Cabin crew"], ["AME", "Engineer (AME)"], ["GROUND_CREW", "Ground crew"]];
const HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 24];
const TIMES = Array.from({ length: 18 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`);

const dayLabel = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const dayValue = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" });
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() + i * 86_400_000)).map((d) => ({ value: dayValue.format(d), label: dayLabel.format(d) }));

export function CrewDispatcher(props: { airfields: AirfieldOption[]; defaultBase: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <Dispatcher {...props} />
    </MotionConfig>
  );
}

function Dispatcher({ airfields, defaultBase }: { airfields: AirfieldOption[]; defaultBase: string }) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [role, setRole] = useState("PILOT");
  const [summary, setSummary] = useState("");
  const [list, setList] = useState<Shortlist | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayOptions = useMemo(() => days(30), []);

  async function find(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const startsAt = `${f.get("date")}T${f.get("time")}:00+02:00`;
    if (new Date(startsAt).getTime() <= Date.now()) return setError("Choose a start time in the future.");
    const roleVal = String(f.get("role"));
    const type = roleVal === "PILOT" ? String(f.get("aircraftType") ?? "") : "";

    setBusy(true);
    setError(null);
    try {
      const create = await fetch("/api/crew-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleVal, aircraftType: type || undefined, departureIcao: f.get("departureIcao"), startsAt, hoursRequired: Number(f.get("hours")) }),
      });
      const created = await create.json().catch(() => null);
      if (!create.ok) return setError(apiErrorMessage(created));

      const res = await fetch(`/api/crew-requests/${created.id}/shortlist`, { cache: "no-store" });
      if (!res.ok) return setError("Could not build the shortlist. Please try again.");
      setList(await res.json());
      setRequestId(created.id);
      const lead = roleVal === "PILOT" ? (AIRCRAFT_TYPES.find(([c]) => c === type)?.[1] ?? type) : (ROLES.find(([v]) => v === roleVal)?.[1] ?? roleVal);
      setSummary(`${lead} · ${f.get("departureIcao")} · ${formatWindow(startsAt, new Date(new Date(startsAt).getTime() + Number(f.get("hours")) * 3_600_000).toISOString())}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew-requests/${requestId}/dispatch`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.error === "no_candidates" ? "No eligible crew right now." : apiErrorMessage(data));
      setStatus({ status: "OPEN", dispatched: true, assignedPersonId: null, pings: [] });
    } finally {
      setBusy(false);
    }
  }

  // After dispatch, poll. Each poll also advances the cascade server-side.
  const poll = useCallback(async () => {
    if (!requestId) return;
    const res = await fetch(`/api/crew-requests/${requestId}/status`, { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, [requestId]);
  const live = status?.dispatched && status.status === "OPEN";
  useEffect(() => {
    if (!status?.dispatched) return;
    void poll();
    if (status.status !== "OPEN") return;
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.dispatched, requestId, poll]);

  function reset() {
    setRequestId(null);
    setList(null);
    setStatus(null);
    setError(null);
  }

  if (!list) {
    return (
      <form onSubmit={find} className={`${cardCls} grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2`}>
        <SelectField label="Role" name="role" defaultValue="PILOT" onChange={(e) => setRole(e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
        {role === "PILOT" ? (
          <SelectField label="Aircraft type" name="aircraftType" required defaultValue="" hint="The pilot must hold an exact type rating.">
            <option value="" disabled>Select a type…</option>
            {AIRCRAFT_TYPES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </SelectField>
        ) : (
          <p className="text-sm text-slate-tac sm:self-end sm:pb-3">Cabin &amp; other crew aren&rsquo;t matched on an aircraft type rating.</p>
        )}
        <SelectField label="Reporting airfield" name="departureIcao" required defaultValue={defaultBase}>
          <option value="" disabled>Select an airfield…</option>
          {airfields.map((a) => <option key={a.icao} value={a.icao}>{a.icao} · {a.city} — {a.name}</option>)}
        </SelectField>
        <SelectField label="Hours required" name="hours" defaultValue="4">{HOURS.map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}</SelectField>
        <SelectField label="Date" name="date" defaultValue={dayOptions[0].value}>{dayOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</SelectField>
        <SelectField label="Start time (SAST)" name="time" defaultValue="08:00">{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
        <div className="space-y-4 sm:col-span-2">
          <FormError message={error} />
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Matching…" : "Find matching crew"}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="min-w-0 break-words text-slate-tac">{summary}</p>
        {!status?.dispatched && <button type="button" onClick={reset} className={ghostBtn}>Change request</button>}
      </div>

      {!status?.dispatched && (
        <>
          {list.shortlist.length === 0 ? (
            <div className={`${cardCls} space-y-4`}>
              <h2 className="font-display text-2xl text-ivory sm:text-3xl">No eligible crew right now</h2>
              <p className="text-slate-tac">Everyone was filtered out by a mandatory check — most often nobody is marked available for this exact window. Try a different time or airfield, or check the reasons below.</p>
              <ExcludedSummary list={list} />
              <Link href="/operator/bench" className={standaloneLinkCls}>Offer your own crew to the shared pool to reach more</Link>
            </div>
          ) : (
            <>
              <motion.ol variants={staggerContainer(0.1)} initial="hidden" animate="show" className="grid gap-4 sm:gap-5 lg:grid-cols-3">
                {list.shortlist.map((m, i) => <CandidateCard key={m.personId} m={m} rank={i + 1} />)}
              </motion.ol>
              <ExcludedSummary list={list} />
              <div className={`${cardCls} flex flex-wrap items-center justify-between gap-4`}>
                <p className="max-w-xl text-sm text-slate-tac">
                  Pings the {list.shortlist.length} candidate{list.shortlist.length > 1 ? "s" : ""} above on WhatsApp and in-app. They have <strong className="text-ivory">10 minutes</strong> to
                  accept. If nobody accepts, the next-ranked candidate is pinged automatically
                  {list.benchCount > 0 ? ` (${list.benchCount} more eligible in reserve)` : ""}.
                </p>
                <button type="button" onClick={dispatch} disabled={busy} className={`${primaryBtn} w-full px-8 py-4 text-base sm:w-auto`}>{busy ? "Sending…" : "Dispatch 10-min confirm ping"}</button>
              </div>
            </>
          )}
          <FormError message={error} />
        </>
      )}

      {status?.dispatched && <DispatchStatus status={status} live={Boolean(live)} reset={reset} />}
    </div>
  );
}

function ExcludedSummary({ list }: { list: Shortlist }) {
  if (list.excludedCount === 0) return null;
  return (
    <details className="glass rounded-2xl text-sm">
      <summary className="cursor-pointer px-4 py-3 text-slate-tac">{list.excludedCount} candidate{list.excludedCount > 1 ? "s were" : " was"} excluded. Why?</summary>
      <ul className="space-y-1 px-4 pb-4 text-slate-tac">
        {list.excludedByReason.map((r) => <li key={r.code}><span className="text-ivory">{r.count}</span> · {r.label}</li>)}
      </ul>
    </details>
  );
}

function CandidateCard({ m, rank }: { m: Match; rank: number }) {
  return (
    <motion.li variants={flightCardVariant} className={`${cardCls} list-none`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Candidate #{rank}</p>
          <h2 className="mt-1 break-words font-display text-2xl text-ivory">{m.name}</h2>
          <p className="text-xs capitalize text-slate-tac">{m.pool}</p>
        </div>
        <div className="shrink-0 text-right" aria-label={`Score ${m.score} out of 100`}>
          <p className="font-display text-4xl text-gold-gradient">{m.score}</p>
          <p className="text-xs uppercase tracking-widest text-slate-tac">of 100</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {m.badges.map((b) => (
          <li key={b.label}>
            <Pill tone={b.ok ? "ok" : "neutral"}>{b.label}: {b.value}</Pill>
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        {m.breakdown.map((l) => (
          <div key={l.criterion}>
            <div className="flex justify-between text-xs">
              <span className="text-ivory">{l.criterion}</span>
              <span className="text-slate-tac">{l.points} / {l.max}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="presentation">
              <motion.div initial={{ width: 0 }} animate={{ width: `${(l.points / l.max) * 100}%`, transition: { duration: 0.8, ease: EASE_LUXE } }} className="h-full rounded-full bg-gold" />
            </div>
            <p className="mt-1 text-xs text-slate-tac">{l.detail}</p>
          </div>
        ))}
      </div>
    </motion.li>
  );
}

const PING: Record<PingRow["status"], { label: string; tone: PillTone }> = {
  PENDING: { label: "Waiting", tone: "gold" },
  ACCEPTED: { label: "Accepted", tone: "ok" },
  DECLINED: { label: "Declined", tone: "err" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

function DispatchStatus({ status, live, reset }: { status: Status; live: boolean; reset: () => void }) {
  const filled = status.status === "FILLED";
  const winner = status.pings.find((p) => p.status === "ACCEPTED");
  const stillPending = status.pings.some((p) => p.status === "PENDING");
  const exhausted = live && status.pings.length > 0 && !stillPending;

  return (
    <section className={cardCls} aria-live="polite">
      <AnimatePresence mode="wait">
        {filled ? (
          <motion.div key="filled" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="font-display text-3xl text-emerald-status">Crew confirmed</h2>
            <p className="mt-2 text-ivory">{winner?.name ?? "A crew member"} accepted and is now booked for this window.</p>
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="font-display text-3xl text-ivory">Waiting for confirmation…</h2>
            <p className="mt-1 text-sm text-slate-tac">This updates automatically. You can leave the page: crew can still accept.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="mt-6 space-y-3">
        {status.pings.map((p) => (
          <li key={p.personId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
            <p className="min-w-0 break-words text-ivory">
              <span className="mr-2 text-xs text-slate-tac">#{p.rank}</span>
              {p.name}
              <span className="ml-2 text-xs text-slate-tac">{p.whatsappSent ? "WhatsApp + in-app" : "in-app"}</span>
            </p>
            <Pill tone={PING[p.status].tone}>
              {p.status === "PENDING" ? `${PING.PENDING.label} · ${Math.floor(p.secondsLeft / 60)}:${String(p.secondsLeft % 60).padStart(2, "0")} left` : PING[p.status].label}
            </Pill>
          </li>
        ))}
        {status.pings.length === 0 && <li className="text-sm text-slate-tac">Sending pings…</li>}
      </ul>

      {exhausted && <Alert className="mt-4">Everyone eligible has been pinged and nobody has accepted. Try a different time, or offer your own pilots to the pool.</Alert>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={ghostBtn}>New request</button>
        <Link href="/operator/crewing" className={ghostBtn}>All requests</Link>
      </div>
    </section>
  );
}
