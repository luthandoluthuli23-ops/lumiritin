import type { Metadata } from "next";
import Link from "next/link";
import { EmptyLegWizard } from "@/components/operator/EmptyLegWizard";
import { listAirfields } from "@/lib/airfield-db";
import { db } from "@/lib/db";
import { requireOperator } from "@/lib/session";
import { primaryBtn } from "@/components/ui/Field";

export const metadata: Metadata = { title: "Publish an empty leg — Lumiritin" };

export default async function NewEmptyLegPage() {
  const { operatorId } = await requireOperator();
  const [aircraft, airfields] = await Promise.all([
    db.aircraft.findMany({ where: { operatorId }, orderBy: { registration: "asc" } }),
    listAirfields(),
  ]);

  if (aircraft.length === 0) {
    return (
      <div className="glass mx-auto max-w-xl rounded-3xl p-10 text-center">
        <h1 className="font-display text-4xl text-ivory">Add an aircraft first</h1>
        <p className="mt-3 text-slate-tac">Empty legs are sold per seat on one of your registered aircraft.</p>
        <Link href="/operator/fleet" className={`${primaryBtn} mt-6 inline-block`}>Go to fleet</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-5xl text-ivory">Publish an empty leg</h1>
        <p className="mt-2 max-w-xl text-slate-tac">Turn a ferry or repositioning flight into seats passengers can book at a discount.</p>
      </header>
      <EmptyLegWizard
        airfields={airfields}
        aircraft={aircraft.map((a) => ({ id: a.id, registration: a.registration, type: a.typeDesignator, seats: a.seatCapacity, base: a.baseIcao ?? "", hourlyRateZar: a.hourlyRateZar }))}
      />
    </div>
  );
}
