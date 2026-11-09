import type { Metadata } from "next";
import { AddAircraftForm } from "@/components/operator/AddAircraftForm";
import { listAirfields } from "@/lib/airfield-db";
import { db } from "@/lib/db";
import { aircraftName, formatZar } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";
import { cardCls } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";

export const metadata: Metadata = { title: "Fleet — Lumiritin" };

export default async function FleetPage() {
  const { operatorId } = await requireOperator();
  const [aircraft, airfields] = await Promise.all([
    db.aircraft.findMany({ where: { operatorId }, orderBy: { registration: "asc" } }),
    listAirfields(),
  ]);

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader title="Fleet" subtitle={`${aircraft.length} registered aircraft.`} />

      {aircraft.length === 0 ? (
        <EmptyState title="No aircraft yet">Add your first one below to start publishing empty legs.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {aircraft.map((a) => (
            <li key={a.id} className={`${cardCls} spotlight`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-2xl tracking-wider text-gold-gradient">{a.registration}</p>
                <Pill className="shrink-0">{a.typeDesignator}</Pill>
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

      <section className={cardCls}>
        <h2 className="font-display text-2xl text-ivory">Add an aircraft</h2>
        <AddAircraftForm airfields={airfields} />
      </section>
    </div>
  );
}

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-col-reverse rounded-2xl bg-white/5 px-2 py-2.5">
    <dt className="text-xs uppercase tracking-widest text-slate-tac">{label}</dt>
    <dd className="break-words text-sm font-medium text-ivory">{value}</dd>
  </div>
);
