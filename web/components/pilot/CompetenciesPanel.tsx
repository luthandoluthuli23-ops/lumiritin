"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormError, apiErrorMessage, cardCls, ghostBtnSm, primaryBtnSm } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { COMPETENCY_LABEL, competenciesForRole, groupsForRole } from "@/lib/competencies";

export function CompetenciesPanel({ initial, role = "PILOT" }: { initial: string[]; role?: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = competenciesForRole(role);
  const groups = groupsForRole(role);

  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/competencies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencies: selected }),
      });
      if (!res.ok) {
        setError(apiErrorMessage(await res.json().catch(() => null)));
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setSelected(initial);
    setError(null);
    setEditing(false);
  }

  return (
    <section className={cardCls} aria-labelledby="comp-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="comp-h" className="font-display text-2xl text-ivory">Competencies</h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className={ghostBtnSm}>Edit</button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={primaryBtnSm}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={cancel} disabled={busy} className={ghostBtnSm}>Cancel</button>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-tac">Specialised operations you&rsquo;re rated and current for. Operators match on these.</p>

      {!editing ? (
        selected.length === 0 ? (
          <p className="mt-4 text-sm text-slate-tac">None added yet. Tap Edit to list your sling, night, NVG, offshore and other competencies.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {selected.map((code) => (
              <li key={code}><Pill tone="gold">{COMPETENCY_LABEL[code] ?? code}</Pill></li>
            ))}
          </ul>
        )
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-xs uppercase tracking-[0.2em] text-gold">{group}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {items.filter((c) => c.group === group).map((c) => {
                  const on = selected.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggle(c.code)}
                      aria-pressed={on}
                      className={`inline-flex items-center rounded-full px-4 py-2 text-sm transition pointer-coarse:min-h-11 ${on ? "bg-gold text-obsidian" : "border border-white/20 text-slate-tac hover:text-ivory"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="empty:hidden"><FormError message={error} /></div>
        </div>
      )}
    </section>
  );
}
