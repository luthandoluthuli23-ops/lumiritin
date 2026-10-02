"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { aircraftName, formatWindow } from "@/lib/empty-legs-shared";
import { ghostBtn, primaryBtn } from "@/components/ui/Field";

interface Ping {
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  secondsLeft: number;
  pilotName: string;
  operatorName: string;
  role: string;
  types: string[];
  departureIcao: string;
  startsAt: string;
  endsAt: string;
  hoursRequired: number;
}

const ERROR_TEXT: Record<string, string> = {
  expired: "Sorry, the 10 minutes ran out. The request has moved on to another pilot.",
  already_filled: "This job was just taken by another pilot.",
  no_longer_available: "Your availability changed, so you can't take this job. Update your availability and wait for the next request.",
  not_pending: "You have already responded to this request.",
  not_found: "This link isn't valid.",
  rate_limited: "Too many attempts. Please wait a moment.",
};

const CLOSED: Record<string, string> = {
  ACCEPTED: "You accepted this job. You are now booked for this time and the operator has been told.",
  DECLINED: "You declined this request. Thank you for letting us know.",
  EXPIRED: "This request has expired and moved on to another pilot.",
  CANCELLED: "This request is no longer available: another pilot accepted first.",
};

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

export function RespondCard({ token }: { token: string }) {
  const [ping, setPing] = useState<Ping | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crew-pings/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    if (res.ok) setPing(await res.json());
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const left = useCountdown(ping?.secondsLeft ?? 0);
  // When the clock runs out, re-ask the server so the page shows the true final state.
  useEffect(() => {
    if (ping?.status === "PENDING" && left === 0) void load();
  }, [left, ping?.status, load]);

  async function respond(decision: "ACCEPT" | "DECLINE") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/crew-pings/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) setMessage(ERROR_TEXT[data?.error] ?? "Something went wrong. Please try again.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <p className="glass rounded-3xl p-8 text-slate-tac">This link isn&rsquo;t valid or has been removed.</p>;
  if (!ping) return <p className="text-slate-tac">Loading…</p>;

  const open = ping.status === "PENDING" && left > 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <article className="glass rounded-3xl p-8 shadow-gold">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Crew request for {ping.pilotName}</p>
      <h1 className="mt-3 font-display text-4xl text-ivory">{ping.operatorName}</h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <Row label="Aircraft" value={ping.types.map(aircraftName).join(", ") || "—"} />
        <Row label="Reporting at" value={ping.departureIcao} />
        <Row label="When" value={formatWindow(ping.startsAt, ping.endsAt)} />
        <Row label="Duration" value={`${ping.hoursRequired} hour${ping.hoursRequired === 1 ? "" : "s"}`} />
      </dl>

      {open ? (
        <>
          <p className="mt-6 rounded-2xl bg-gold/10 px-4 py-3 text-center" role="timer" aria-live="off">
            <span className="text-xs uppercase tracking-widest text-slate-tac">Respond within</span>
            <span className="mt-1 block font-mono text-4xl text-gold-light">{mm}:{ss}</span>
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" disabled={busy} onClick={() => respond("ACCEPT")} className={`${primaryBtn} flex-1 py-4 text-base`}>Accept job</button>
            <button type="button" disabled={busy} onClick={() => respond("DECLINE")} className={`${ghostBtn} flex-1`}>Decline</button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-tac">Accepting books you for this time and tells the operator straight away.</p>
        </>
      ) : (
        <p className="mt-6 rounded-2xl bg-white/5 px-4 py-4 text-slate-tac">{CLOSED[ping.status === "PENDING" ? "EXPIRED" : ping.status]}</p>
      )}
      {message && <p role="alert" className="mt-4 rounded-lg bg-alert/10 px-4 py-2.5 text-sm text-alert">{message}</p>}
      <Link href="/wallet" className="mt-6 inline-block text-sm text-gold-light underline underline-offset-4">Open my wallet</Link>
    </article>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase tracking-widest text-slate-tac">{label}</dt>
    <dd className="mt-1 text-ivory">{value}</dd>
  </div>
);
