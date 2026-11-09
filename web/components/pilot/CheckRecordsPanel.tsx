"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError, SelectField, TextField, cardCls, dangerBtn, dangerTextBtn, ghostBtnSm, primaryBtn } from "@/components/ui/Field";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { CHECK_TYPES, CHECK_TYPE_LABEL, checkStatus } from "@/lib/checks";
import { formatDate } from "./format";

export interface CheckRow {
  id: string;
  checkType: string;
  aircraftType: string;
  completedAt: string; // ISO date
  examiner: string;
  expiresAt: string; // ISO date
}

const TONE: Record<"green" | "amber" | "red", PillTone> = { green: "ok", amber: "warn", red: "err" };

export function CheckRecordsPanel({ records }: { records: CheckRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkType: f.get("checkType"),
          aircraftType: f.get("aircraftType"),
          examiner: f.get("examiner"),
          completedAt: f.get("completedAt"),
          expiresAt: f.get("expiresAt"),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.issues?.[0]?.message ?? "Please check the fields and try again.");
        return;
      }
      form.reset();
      setAdding(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    setListError(null);
    try {
      const res = await fetch(`/api/pilot/checks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setListError("Couldn't remove that check record. Please try again.");
        return;
      }
      setConfirmingId(null);
      router.refresh();
    } catch {
      setListError("Network error. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  const sorted = [...records].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  return (
    <section className={cardCls} aria-labelledby="checks-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checks-h" className="font-display text-2xl text-ivory">Check records</h2>
        <button type="button" onClick={() => setAdding((a) => !a)} className={ghostBtnSm}>
          {adding ? "Close" : "+ Add check"}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-tac">Recurrent proficiency and rating checks. Status updates itself from the expiry date.</p>

      {adding && (
        <form onSubmit={add} className="mt-4 grid gap-4 rounded-2xl bg-white/5 p-4 sm:grid-cols-2">
          <SelectField label="Check type" name="checkType" required defaultValue="PPC">
            {CHECK_TYPES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </SelectField>
          <TextField label="Aircraft type" name="aircraftType" required placeholder="e.g. H125" />
          <TextField label="Date completed" name="completedAt" type="date" required />
          <TextField label="Examiner (DFE)" name="examiner" required placeholder="Examiner name" />
          <TextField label="Expiry date" name="expiresAt" type="date" required />
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className={`${primaryBtn} w-full sm:w-auto`}>
              {busy ? "Saving…" : "Save check"}
            </button>
          </div>
          <div className="empty:hidden sm:col-span-2"><FormError message={error} /></div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-slate-tac">No checks recorded yet. Add your PPC, instrument rating, line check and others to show you&rsquo;re current.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10">
          {sorted.map((r) => {
            const st = checkStatus(new Date(r.expiresAt));
            const name = CHECK_TYPE_LABEL[r.checkType] ?? r.checkType;
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="break-words text-ivory">
                      {name} <span className="text-slate-tac">· {r.aircraftType}</span>
                    </p>
                    <p className="break-words text-xs text-slate-tac">Completed {formatDate(r.completedAt)} · {r.examiner} · expires {formatDate(r.expiresAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={TONE[st.tone]} className="whitespace-nowrap">{st.label}</Pill>
                    {confirmingId !== r.id && (
                      <button type="button" onClick={() => { setConfirmingId(r.id); setListError(null); }} aria-label={`Remove ${name} check for ${r.aircraftType}`} className={dangerTextBtn}>Remove</button>
                    )}
                  </div>
                </div>
                {confirmingId === r.id && (
                  <div role="group" aria-label="Confirm removal" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-alert/10 p-3">
                    <p className="text-sm text-ivory">Remove this check record?</p>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => setConfirmingId(null)} disabled={removingId === r.id} className={ghostBtnSm} autoFocus>Keep</button>
                      <button type="button" onClick={() => remove(r.id)} disabled={removingId === r.id} className={dangerBtn}>{removingId === r.id ? "Removing…" : "Remove"}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 empty:hidden"><FormError message={listError} /></div>
    </section>
  );
}
