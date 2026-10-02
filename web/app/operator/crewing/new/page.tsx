import type { Metadata } from "next";
import { CrewDispatcher } from "@/components/operator/CrewDispatcher";
import { listAirfields } from "@/lib/airfield-db";
import { requireOperator } from "@/lib/session";

export const metadata: Metadata = { title: "Crew dispatcher — Lumiritin" };

export default async function NewCrewRequestPage() {
  const { baseIcao } = await requireOperator();
  const airfields = await listAirfields();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-5xl text-ivory">Crew dispatcher</h1>
        <p className="mt-2 max-w-2xl text-slate-tac">
          Describe the flight. We rank qualified, available pilots with transparent scoring, then ping the top three. They have 10 minutes to accept before the next
          pilot is tried.
        </p>
      </header>
      <CrewDispatcher airfields={airfields} defaultBase={baseIcao ?? ""} />
    </div>
  );
}
