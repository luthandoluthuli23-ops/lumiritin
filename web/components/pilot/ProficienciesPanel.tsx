"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROFICIENCIES, PROFICIENCY_GROUPS, PROFICIENCY_LABEL } from "@/lib/proficiencies";

export function ProficienciesPanel({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/pilot/proficiencies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proficiencies: selected }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ivory">Proficiencies</h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-ivory transition hover:border-gold/60">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setSelected(initial); setEditing(false); }} className="rounded-full px-3 py-1.5 text-sm text-slate-tac hover:text-ivory">
              Cancel
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-tac">Specialised operations you&rsquo;re rated and current for. Operators match on these.</p>

      {!editing ? (
        selected.length === 0 ? (
          <p className="mt-4 text-sm text-slate-tac">None added yet. Tap Edit to list your sling, night, NVG, offshore and other proficiencies.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {selected.map((code) => (
              <li key={code} className="rounded-full bg-gold/15 px-3 py-1 text-sm text-gold-light">{PROFICIENCY_LABEL[code] ?? code}</li>
            ))}
          </ul>
        )
      ) : (
        <div className="mt-4 space-y-5">
          {PROFICIENCY_GROUPS.map((group) => (
            <div key={group}>
              <p className="text-xs uppercase tracking-[0.2em] text-gold">{group}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROFICIENCIES.filter((p) => p.group === group).map((p) => {
                  const on = selected.includes(p.code);
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => toggle(p.code)}
                      aria-pressed={on}
                      className={`rounded-full px-3 py-1.5 text-sm transition ${on ? "bg-gold text-obsidian" : "border border-white/20 text-slate-tac hover:text-ivory"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
