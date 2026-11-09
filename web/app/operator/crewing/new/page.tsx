import type { Metadata } from "next";
import { CrewDispatcher } from "@/components/operator/CrewDispatcher";
import { listAirfields } from "@/lib/airfield-db";
import { requireOperator } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Crew dispatcher — Lumiritin" };

export default async function NewCrewRequestPage() {
  const { baseIcao } = await requireOperator();
  const airfields = await listAirfields();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Crew dispatcher"
        subtitle="Describe the flight and pick the role — flight crew or cabin crew. We rank qualified, available crew with transparent scoring, then ping the top three. They have 10 minutes to accept before the next candidate is tried."
      />
      <CrewDispatcher airfields={airfields} defaultBase={baseIcao ?? ""} />
    </div>
  );
}
