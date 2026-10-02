import { AvailabilityPanel } from "@/components/pilot/AvailabilityPanel";
import { CalendarSync } from "@/components/pilot/CalendarSync";
import { RosterAndPings } from "@/components/pilot/RosterAndPings";
import { currentState, describeState } from "@/lib/availability";
import { db } from "@/lib/db";
import { formatWindow } from "@/lib/empty-legs-shared";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The signed-in pilot's own record (middleware already restricts /wallet to pilots; this re-checks). */
async function currentPerson() {
  const session = await requireRole("PILOT", "/wallet");
  return db.person.findFirst({
    where: { user: { id: session.sub } },
    include: {
      credentials: { include: { ratings: { orderBy: { name: "asc" } } } },
      medicals: true,
      logbook: true,
      availability: { where: { endsAt: { gt: new Date(Date.now() - 86_400_000) } } },
      rosterEntries: { include: { operator: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      pings: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        include: { crewRequest: { include: { operator: { select: { name: true } } } } },
        orderBy: { expiresAt: "asc" },
      },
    },
  });
}

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

function daysLeft(d: Date | null): string {
  if (!d) return "";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  return days < 0 ? "expired" : `${days} days`;
}

export default async function WalletPage() {
  const person = await currentPerson();
  if (!person) {
    return (
      <main className="plain-page mx-auto max-w-3xl px-6 pb-16 pt-28">
        <p>No profile yet. Onboarding (licence number, home airfield, radius) goes here.</p>
      </main>
    );
  }

  const state = currentState(person.availability.map((a) => ({ state: a.state, startsAt: a.startsAt, endsAt: a.endsAt })));
  const blockedPeriods = person.availability.filter((a) => a.source === "ICAL").length;
  const connected = Boolean(person.icalUrl);
  let icalHost: string | null = null;
  try {
    icalHost = person.icalUrl ? new URL(person.icalUrl.replace(/^webcal:\/\//i, "https://")).hostname : null;
  } catch {}

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-28">
      <div className="plain-page">
        <h1>{person.fullName}</h1>
        <p>
          Home airfield: {person.homeAirfieldIcao ?? "—"} · Travel radius:{" "}
          {person.travelRadiusKm ? `${person.travelRadiusKm} km` : "—"}
        </p>
      </div>

      <div className="my-8 space-y-6">
        <RosterAndPings
          roster={person.rosterEntries.map((r) => ({ id: r.id, operatorName: r.operator.name, status: r.status, sharedToPool: r.sharedToPool }))}
          pings={person.pings.map((p) => ({
            token: p.token,
            operatorName: p.crewRequest.operator.name,
            departureIcao: p.crewRequest.departureIcao,
            types: p.crewRequest.requiredRatings.join(", ") || "crew",
            window: formatWindow(p.crewRequest.startsAt.toISOString(), p.crewRequest.endsAt.toISOString()),
            secondsLeft: Math.max(0, Math.round((p.expiresAt.getTime() - Date.now()) / 1000)),
          }))}
        />
        <AvailabilityPanel state={state.state} label={describeState(state)} reason={state.reason} />
        <CalendarSync connected={connected} host={icalHost} syncedAt={person.icalSyncedAt?.toISOString() ?? null} lastError={person.icalLastError} blockedPeriods={blockedPeriods} />
      </div>

      <div className="plain-page">

      {person.credentials.map((c) => (
        <section key={c.id}>
          <h2>
            {c.licenceCategory ?? "Licence"} {c.licenceNumber}
          </h2>
          <p>
            Status: {c.portalStatus ?? "unverified"} · Expires {fmt(c.expiresAt)} ({daysLeft(c.expiresAt)}) · Last
            checked {c.lastVerifiedAt ? c.lastVerifiedAt.toLocaleString("en-ZA") : "never"}
          </p>
          <table>
            <thead>
              <tr>
                <th align="left">Rating</th>
                <th align="left">Expires</th>
                <th align="left">Left</th>
              </tr>
            </thead>
            <tbody>
              {c.ratings.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{fmt(r.expiresAt)}</td>
                  <td>{daysLeft(r.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Medical</h2>
      {person.medicals.length === 0 && <p>—</p>}
      {person.medicals.map((m) => (
        <p key={m.id}>
          Class {m.class}: expires {fmt(m.expiresAt)} ({daysLeft(m.expiresAt)})
        </p>
      ))}

      <h2>Logbook</h2>
      <p>{person.logbook ? `${person.logbook.totalHours.toString()} hrs total (as of ${fmt(person.logbook.asOf)})` : "Not uploaded"}</p>
      </div>
    </main>
  );
}
