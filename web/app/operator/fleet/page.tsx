import type { Metadata } from "next";
import { AddAircraftForm } from "@/components/operator/AddAircraftForm";
import { listAirfields } from "@/lib/airfield-db";
import { db } from "@/lib/db";
import { aircraftName, formatZar } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";

export const metadata: Metadata = { title: "Fleet — Lumiritin" };

export default async function FleetPage() {
  const { operatorId } = await requireOperator();
  const [aircraft, airfields] = await Promise.all([
    db.aircraft.findMany({ where: { operatorId }, orderBy: { registration: "asc" } }),
    listAirfields(),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-5xl text-ivory">Fleet</h1>
        <p className="mt-2 text-slate-tac">{aircraft.length} registered {aircraft.length === 1 ? "aircraft" : "aircraft"}.</p>
      </header>

      {aircraft.length === 0 ? (
        <p className="glass rounded-3xl p-8 text-slate-tac">No aircraft yet. Add your first one below to start publishing empty legs.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {aircraft.map((a) => (
            <li key={a.id} className="glass spotlight rounded-3xl p-6">
              <div className="flex items-start justify-between">
                <p className="font-mono text-2xl tracking-wider text-gold-gradient">{a.registration}</p>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-tac">{a.typeDesignator}</span>
              </div>
              <p className="mt-1 text-sm text-ivory">{aircraftName(a.typeDesignator)}</p>
              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Cell label="Pax" value={String(a.seatCapacity)} />
                <Cell label="Base" value={a.baseIcao ?? "—"} />
                <Cell label="Per hour" value={a.hourlyRateZar ? formatZar(a.hourlyRateZar) : "—"} />
              </dl>
            </li>
          ))}
        </ul>
      )}

      <section className="glass rounded-3xl p-6 sm:p-8">
        <h2 className="font-display text-3xl text-ivory">Add an aircraft</h2>
        <AddAircraftForm airfields={airfields} />
      </section>
    </div>
  );
}

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-white/5 px-2 py-2.5">
    <dd className="text-sm font-medium text-ivory">{value}</dd>
    <dt className="text-[10px] uppercase tracking-widest text-slate-tac">{label}</dt>
  </div>
);
