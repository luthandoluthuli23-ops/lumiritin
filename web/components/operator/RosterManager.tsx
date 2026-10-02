"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError, SelectField, TextField, apiErrorMessage, ghostBtn, primaryBtn } from "@/components/ui/Field";

export interface RosterRowData {
  id: string;
  name: string;
  status: "INVITED" | "ACTIVE";
  sharedToPool: boolean;
  stateLabel: string;
  state: "AVAILABLE" | "BOOKED" | "OFF";
  blocks: { id: string; label: string }[];
}

const STATE_STYLE = { AVAILABLE: "bg-emerald-status/15 text-emerald-status", BOOKED: "bg-gold/15 text-gold-light", OFF: "bg-white/5 text-slate-tac" } as const;
const TIMES = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const HOURS = [2, 4, 6, 8, 12, 24, 48, 72];
const dayLabel = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const dayValue = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" });

export function RosterManager({ rows }: { rows: RosterRowData[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => new Date(Date.now() + i * 86_400_000)).map((d) => ({ value: dayValue.format(d), label: dayLabel.format(d) })), []);

  async function call(key: string, url: string, method: string, body?: unknown) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(apiErrorMessage(data));
      router.refresh();
      return data;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const data = await call("invite", "/api/operator/roster", "POST", { email });
    if (data) {
      setInviteMsg(data.message);
      form.reset();
    }
  }

  async function markBusy(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const startsAt = new Date(`${f.get("date")}T${f.get("time")}:00+02:00`);
    const endsAt = new Date(startsAt.getTime() + Number(f.get("hours")) * 3_600_000);
    const data = await call(id, `/api/operator/roster/${id}/book`, "POST", { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: String(f.get("note") ?? "") });
    if (data) setOpen(null);
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <p className="glass rounded-3xl p-6 text-slate-tac">No pilots on your roster yet. Invite one below.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="glass rounded-3xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-2xl text-ivory">{r.name}</p>
                  {r.status === "INVITED" ? (
                    <p className="text-xs text-slate-tac">Invitation sent: waiting for the pilot to accept</p>
                  ) : (
                    <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs ${STATE_STYLE[r.state]}`}>{r.stateLabel}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {r.status === "ACTIVE" && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-tac">
                      <input type="checkbox" checked={r.sharedToPool} disabled={busy === r.id} onChange={(e) => call(r.id, `/api/operator/roster/${r.id}`, "PATCH", { sharedToPool: e.target.checked })} className="accent-[#d4af37]" />
                      Offer to shared pool
                    </label>
                  )}
                  {r.status === "ACTIVE" && <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className={ghostBtn}>Mark busy…</button>}
                  <button type="button" disabled={busy === r.id} onClick={() => call(r.id, `/api/operator/roster/${r.id}`, "DELETE")} className="text-sm text-slate-tac underline underline-offset-4 hover:text-alert">
                    {r.status === "INVITED" ? "Withdraw" : "Remove"}
                  </button>
                </div>
              </div>

              {r.blocks.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-slate-tac">
                  {r.blocks.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3">
                      <span>Busy on your flight: {b.label}</span>
                      <button type="button" onClick={() => call(b.id, `/api/operator/roster/${r.id}/book?windowId=${b.id}`, "DELETE")} className="underline underline-offset-4 hover:text-ivory">Release</button>
                    </li>
                  ))}
                </ul>
              )}

              {open === r.id && (
                <form onSubmit={(e) => markBusy(e, r.id)} className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
                  <SelectField label="Date" name="date" defaultValue={days[0].value}>{days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</SelectField>
                  <SelectField label="From (SAST)" name="time" defaultValue="08:00">{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
                  <SelectField label="For" name="hours" defaultValue="8">{HOURS.map((h) => <option key={h} value={h}>{h} hours</option>)}</SelectField>
                  <TextField label="Note (optional)" name="note" maxLength={120} placeholder="Internal charter" />
                  <div className="sm:col-span-4"><button type="submit" disabled={busy === r.id} className={primaryBtn}>Block this time</button></div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={invite} className="glass grid gap-4 rounded-3xl p-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField label="Invite a pilot by account email" name="email" type="email" required placeholder="pilot@example.com" hint="They must accept before you can see or manage their availability." />
        <button type="submit" disabled={busy === "invite"} className={`${primaryBtn} sm:mb-[2.2rem]`}>{busy === "invite" ? "Sending…" : "Send invitation"}</button>
      </form>
      {inviteMsg && <p role="status" className="rounded-xl bg-emerald-status/10 px-4 py-2.5 text-sm text-emerald-status">{inviteMsg}</p>}
      <FormError message={error} />
    </div>
  );
}
