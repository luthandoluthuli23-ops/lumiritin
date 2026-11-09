import type { Metadata } from "next";
import Link from "next/link";
import { EmptyLegWizard } from "@/components/operator/EmptyLegWizard";
import { listAirfields } from "@/lib/airfield-db";
import { db } from "@/lib/db";
import { requireOperator } from "@/lib/session";
import { primaryBtn } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Publish an empty leg — Lumiritin" };

export default async function NewEmptyLegPage() {
  const { operatorId } = await requireOperator();
  const [aircraft, airfields] = await Promise.all([
    db.aircraft.findMany({ where: { operatorId }, orderBy: { registration: "asc" } }),
    listAirfields(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Publish an empty leg" subtitle="Turn a ferry or repositioning flight into seats passengers can book at a discount." />
      {aircraft.length === 0 ? (
        <EmptyState title="Add an aircraft first" action={<Link href="/operator/fleet" className={primaryBtn}>Go to fleet</Link>}>
          Empty legs are sold per seat on one of your registered aircraft.
        </EmptyState>
      ) : (
        <EmptyLegWizard
          airfields={airfields}
          aircraft={aircraft.map((a) => ({ id: a.id, registration: a.registration, type: a.typeDesignator, seats: a.seatCapacity, base: a.baseIcao ?? "", hourlyRateZar: a.hourlyRateZar }))}
        />
      )}
    </div>
  );
}
