import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatWindow } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";
import { cardCls, primaryBtn } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, type PillTone } from "@/components/ui/Pill";

export const metadata: Metadata = { title: "Crew requests — Lumiritin" };

const ROLE: Record<string, string> = { PILOT: "Pilot", CABIN_CREW: "Cabin crew", AME: "Engineer (AME)", GROUND_CREW: "Ground crew" };
const STATUS: Record<string, { label: string; tone: PillTone }> = {
  OPEN: { label: "Open", tone: "ok" },
  FILLED: { label: "Filled", tone: "gold" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export default async function CrewingPage() {
  const { operatorId } = await requireOperator();
  const requests = await db.crewRequest.findMany({
    where: { operatorId },
    orderBy: { startsAt: "asc" },
    include: { aircraft: { select: { registration: true } } },
  });
  const filledBy = new Map(
    (await db.person.findMany({ where: { id: { in: requests.flatMap((r) => (r.assignedPersonId ? [r.assignedPersonId] : [])) } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Crew requests"
        subtitle="Urgent contract positions for qualified crew."
        action={<Link href="/operator/crewing/new" className={primaryBtn}>Post crew request</Link>}
      />

      {requests.length === 0 ? (
        <EmptyState title="No requests yet" />
      ) : (
        <ul className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          {requests.map((r) => (
            <li key={r.id} className={cardCls}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-display text-2xl text-ivory">{ROLE[r.role]} from {r.departureIcao}</h2>
                <Pill tone={STATUS[r.status].tone} className="shrink-0">{STATUS[r.status].label}</Pill>
              </div>
              <p className="mt-1 text-sm text-slate-tac">{formatWindow(r.startsAt.toISOString(), r.endsAt.toISOString())}</p>
              <p className="mt-3 text-sm text-ivory">
                {r.requiredRatings.length ? r.requiredRatings.join(", ") : "No type rating required"}
                {r.minTotalHours ? ` · ${r.minTotalHours.toLocaleString("en-ZA")}+ hrs` : ""}
                {r.aircraft ? ` · ${r.aircraft.registration}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-tac">
                {r.status === "FILLED" && r.assignedPersonId
                  ? `Filled by ${filledBy.get(r.assignedPersonId) ?? "a pilot"}`
                  : r.dispatchedAt
                    ? "Pings sent: waiting for a pilot to accept"
                    : "Not dispatched yet"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
