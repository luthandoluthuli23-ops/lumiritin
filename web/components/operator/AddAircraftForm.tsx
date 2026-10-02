"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AirfieldOption } from "@/lib/geo";
import { AirfieldAutocomplete } from "@/components/charter/AirfieldAutocomplete";
import { FormError, TextField, apiErrorMessage, primaryBtn } from "@/components/ui/Field";

export function AddAircraftForm({ airfields }: { airfields: AirfieldOption[] }) {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!base) return setError("Choose the aircraft's base airfield.");
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/aircraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration: f.get("registration"),
          typeDesignator: f.get("typeDesignator"),
          baseIcao: base,
          seatCapacity: Number(f.get("seatCapacity")),
          hourlyRateZar: Number(f.get("hourlyRateZar")),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(apiErrorMessage(data));
      form.reset();
      setBase("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <TextField label="Registration" name="registration" required placeholder="ZS-PRV" pattern="[Zz][SsUu]-[A-Za-z]{3}" title="e.g. ZS-PRV" />
      <TextField label="ICAO type" name="typeDesignator" required placeholder="C525" maxLength={4} hint="e.g. C525, E55P, PC12" />
      <AirfieldAutocomplete airfields={airfields} value={base} onChange={setBase} label="Base airfield" required />
      <TextField label="Passenger seats" name="seatCapacity" type="number" min={1} max={19} defaultValue={6} required />
      <TextField label="Hourly rate (ZAR)" name="hourlyRateZar" type="number" min={1000} step={100} required placeholder="45000" />
      <div className="flex items-end">
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? "Adding…" : "Add aircraft"}</button>
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><FormError message={error} /></div>
    </form>
  );
}
