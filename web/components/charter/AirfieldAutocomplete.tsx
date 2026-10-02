"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AirfieldOption } from "@/lib/geo";

interface Props {
  airfields: readonly AirfieldOption[];
  /** Selected ICAO code, or "" for none. */
  value: string;
  onChange: (icao: string) => void;
  label: string;
  placeholder?: string;
  /** ICAO codes to hide, e.g. the origin when choosing a destination. */
  exclude?: readonly string[];
  required?: boolean;
  name?: string;
}

const label = (a: AirfieldOption) => `${a.icao}${a.iata ? ` / ${a.iata}` : ""} · ${a.city}`;

/** Accessible combobox over a known list of airfields: matches ICAO, IATA, city and airport name. */
export function AirfieldAutocomplete({ airfields, value, onChange, label: fieldLabel, placeholder = "ICAO, IATA or city", exclude = [], required, name }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = airfields.find((a) => a.icao === value);
  const [query, setQuery] = useState(selected ? label(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Follow external changes (e.g. geolocation picking an airfield) but never clobber what the user is typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setQuery(selected ? label(selected) : "");
  }, [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = airfields.filter((a) => !exclude.includes(a.icao));
    if (!q || (selected && query === label(selected))) return pool;
    return pool.filter((a) => [a.icao, a.iata ?? "", a.city, a.name].some((s) => s.toLowerCase().includes(q)));
  }, [airfields, exclude, query, selected]);

  function choose(a: AirfieldOption) {
    onChange(a.icao);
    setQuery(label(a));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="text-xs uppercase tracking-widest text-slate-tac">{fieldLabel}</span>
        <input
          ref={inputRef}
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].icao}` : undefined}
          autoComplete="off"
          required={required}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onChange(""); // typing invalidates the previous selection until a new one is chosen
          }}
          onBlur={() => {
            setOpen(false);
            // Free text that is not a chosen airfield is discarded rather than silently submitted.
            setQuery(selected ? label(selected) : "");
          }}
          onKeyDown={onKeyDown}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60 focus:bg-white/10"
        />
      </label>
      {open && (
        <ul id={listId} role="listbox" className="glass absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl bg-obsidian-800/95 py-1 shadow-xl">
          {matches.length === 0 && <li className="px-4 py-3 text-sm text-slate-tac">No matching airfield</li>}
          {matches.map((a, i) => (
            <li
              key={a.icao}
              id={`${listId}-${a.icao}`}
              role="option"
              aria-selected={a.icao === value}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus so blur does not fire before the click registers
                choose(a);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? "bg-gold/15 text-ivory" : "text-slate-tac"}`}
            >
              <span className="font-medium text-ivory">{a.icao}</span>
              {a.iata && <span className="text-slate-tac"> / {a.iata}</span>} · {a.city}
              <span className="block text-xs text-slate-tac">{a.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
