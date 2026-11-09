"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormError, SelectField, TextField, apiErrorMessage, cardCls, dangerTextBtn, ghostBtnSm, primaryBtn } from "@/components/ui/Field";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { InvitePilotForm } from "@/components/operator/InvitePilotForm";
import { PoolToggle } from "@/components/operator/PoolToggle";

export interface RosterRowData {
  id: string;
  name: string;
  status: "INVITED" | "ACTIVE";
  sharedToPool: boolean;
  stateLabel: string;
  state: "AVAILABLE" | "BOOKED" | "OFF";
  blocks: { id: string; label: string }[];
}

const STATE_TONE: Record<RosterRowData["state"], PillTone> = { AVAILABLE: "ok", BOOKED: "gold", OFF: "neutral" };
const TIMES = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const HOURS = [2, 4, 6, 8, 12, 24, 48, 72];
const dayLabel = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });
const dayValue = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" });

export function RosterManager({ rows }: { rows: RosterRowData[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function markBusy(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const startsAt = new Date(`${f.get("date")}T${f.get("time")}:00+02:00`);
    const endsAt = new Date(startsAt.getTime() + Number(f.get("hours")) * 3_600_000);
    const data = await call(id, `/api/operator/roster/${id}/book`, "POST", { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note: String(f.get("note") ?? "") });
    if (data) setOpen(null);
  }

  function remove(r: RosterRowData) {
    if (r.status === "ACTIVE" && !confirm(`Remove ${r.name} from your roster?`)) return;
    void call(r.id, `/api/operator/roster/${r.id}`, "DELETE");
  }

  return (
    <div className="space-y-6">
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No pilots on your roster yet">Invite one below.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className={cardCls}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                  <p className="break-words font-display text-2xl text-ivory">{r.name}</p>
                  {r.status === "INVITED" ? (
                    <p className="text-xs text-slate-tac">Invitation sent: waiting for the pilot to accept</p>
                  ) : (
                    <Pill tone={STATE_TONE[r.state]} className="mt-1">{r.stateLabel}</Pill>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {r.status === "ACTIVE" && (
                    <PoolToggle shared={r.sharedToPool} busy={busy === r.id} onToggle={() => call(r.id, `/api/operator/roster/${r.id}`, "PATCH", { sharedToPool: !r.sharedToPool })} />
                  )}
                  {r.status === "ACTIVE" && (
                    <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className={ghostBtnSm}>Mark busy…</button>
                  )}
                  <button type="button" disabled={busy === r.id} onClick={() => remove(r)} className={dangerTextBtn}>
                    {r.status === "INVITED" ? "Withdraw" : "Remove"}
                  </button>
                </div>
              </div>

              {r.blocks.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs text-slate-tac">
                  {r.blocks.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 break-words">Busy on your flight: {b.label}</span>
                      <button type="button" disabled={busy === b.id} onClick={() => call(b.id, `/api/operator/roster/${r.id}/book?windowId=${b.id}`, "DELETE")} className={ghostBtnSm}>Release</button>
                    </li>
                  ))}
                </ul>
              )}

              {open === r.id && (
                <form onSubmit={(e) => markBusy(e, r.id)} className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <SelectField label="Date" name="date" defaultValue={days[0].value}>{days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</SelectField>
                  <SelectField label="From (SAST)" name="time" defaultValue="08:00">{TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
                  <SelectField label="For" name="hours" defaultValue="8">{HOURS.map((h) => <option key={h} value={h}>{h} hours</option>)}</SelectField>
                  <TextField label="Note (optional)" name="note" maxLength={120} placeholder="Internal charter" />
                  <div className="sm:col-span-2 lg:col-span-4"><button type="submit" disabled={busy === r.id} className={primaryBtn}>Block this time</button></div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <InvitePilotForm hint="They must accept before you can see or manage their availability." />
    </div>
  );
}
