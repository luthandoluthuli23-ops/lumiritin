import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatWindow } from "@/lib/empty-legs-shared";
import { requireOperator } from "@/lib/session";
import { primaryBtn } from "@/components/ui/Field";

export const metadata: Metadata = { title: "Crew requests — Lumiritin" };

const ROLE: Record<string, string> = { PILOT: "Pilot", CABIN_CREW: "Cabin crew", AME: "Engineer (AME)", GROUND_CREW: "Ground crew" };
const STATUS_STYLE: Record<string, string> = { OPEN: "bg-emerald-status/15 text-emerald-status", FILLED: "bg-gold/15 text-gold-light", CANCELLED: "bg-white/5 text-slate-tac" };

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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl text-ivory">Crew requests</h1>
          <p className="mt-2 text-slate-tac">Urgent contract positions for qualified crew.</p>
        </div>
        <Link href="/operator/crewing/new" className={primaryBtn}>Post a request</Link>
      </header>

      {requests.length === 0 ? (
        <p className="glass rounded-3xl p-8 text-slate-tac">No requests yet.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {requests.map((r) => (
            <li key={r.id} className="glass rounded-3xl p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-2xl text-ivory">{ROLE[r.role]} from {r.departureIcao}</h2>
                <span className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[r.status]}`}>{r.status.toLowerCase()}</span>
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
