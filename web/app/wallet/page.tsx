import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityPanel } from "@/components/pilot/AvailabilityPanel";
import { CalendarSync } from "@/components/pilot/CalendarSync";
import { CheckRecordsPanel } from "@/components/pilot/CheckRecordsPanel";
import { CompetenciesPanel } from "@/components/pilot/CompetenciesPanel";
import { LumiVerifyPanel } from "@/components/pilot/LumiVerifyPanel";
import { RosterAndPings } from "@/components/pilot/RosterAndPings";
import { formatDate, formatDateTime } from "@/components/pilot/format";
import { h1 } from "@/components/pilot/logbook-shared";
import { cardCls, ghostBtnSm, pageCls } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { currentState, describeState } from "@/lib/availability";
import { checkStatus } from "@/lib/checks";
import { db } from "@/lib/db";
import { formatWindow } from "@/lib/empty-legs-shared";
import { isLumiConfigured } from "@/lib/lumi";
import { rollUp, syncPlatformFlights } from "@/lib/logbook";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Credential wallet — Lumiritin" };
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
      checkRecords: { orderBy: { expiresAt: "asc" } },
      pings: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        include: { crewRequest: { include: { operator: { select: { name: true } } } } },
        orderBy: { expiresAt: "asc" },
      },
    },
  });
}

const STATUS_TONE: Record<"green" | "amber" | "red", PillTone> = { green: "ok", amber: "warn", red: "err" };

/** An expiry date with its status pill (the same Current / Due in Nd / Expired logic as the check records). */
function Expiry({ date }: { date: Date | null }) {
  if (!date) return <>—</>;
  const st = checkStatus(date);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="whitespace-nowrap">{formatDate(date)}</span>
      <Pill tone={STATUS_TONE[st.tone]} className="whitespace-nowrap">{st.label}</Pill>
      {st.status === "CURRENT" && <span className="whitespace-nowrap text-slate-tac">{st.daysLeft} days left</span>}
    </span>
  );
}

const labelCls = "text-xs uppercase tracking-widest text-slate-tac";

export default async function WalletPage() {
  const person = await currentPerson();
  if (!person) {
    return (
      <main className={pageCls}>
        <EmptyState title="No profile yet">Finish setting up your pilot profile to see your credentials here.</EmptyState>
      </main>
    );
  }

  // Same totals as the logbook page: the opening balance plus every logged flight (platform flights are logged first).
  await syncPlatformFlights(person.id);
  const entries = await db.flightLogEntry.findMany({
    where: { personId: person.id },
    select: { date: true, totalHours: true, picHours: true, nightHours: true, instrumentHours: true, multiEngineHours: true, turbineHours: true },
  });
  const totals = rollUp(person.logbook, entries);

  const state = currentState(person.availability.map((a) => ({ state: a.state, startsAt: a.startsAt, endsAt: a.endsAt })));
  const blockedPeriods = person.availability.filter((a) => a.source === "ICAL").length;
  const connected = Boolean(person.icalUrl);
  let icalHost: string | null = null;
  try {
    icalHost = person.icalUrl ? new URL(person.icalUrl.replace(/^webcal:\/\//i, "https://")).hostname : null;
  } catch {}

  return (
    <main className={pageCls}>
      <PageHeader
        eyebrow="Credential wallet"
        title={person.fullName}
        subtitle={`Home airfield: ${person.homeAirfieldIcao ?? "—"} · Travel radius: ${person.travelRadiusKm ? `${person.travelRadiusKm} km` : "—"}`}
        action={<Link href="/wallet/insights" className={ghostBtnSm}>View my reputation →</Link>}
      />

      <div className="mt-10 space-y-6">
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
        <CompetenciesPanel initial={person.competencies} role={person.role} />
        <CheckRecordsPanel
          records={person.checkRecords.map((r) => ({
            id: r.id,
            checkType: r.checkType,
            aircraftType: r.aircraftType,
            completedAt: r.completedAt.toISOString(),
            examiner: r.examiner,
            expiresAt: r.expiresAt.toISOString(),
          }))}
        />
        <CalendarSync connected={connected} host={icalHost} syncedAt={person.icalSyncedAt?.toISOString() ?? null} lastError={person.icalLastError} blockedPeriods={blockedPeriods} />

        {person.credentials.map((c) => (
          <section key={c.id} aria-labelledby={`cred-${c.id}`} className={cardCls}>
            <h2 id={`cred-${c.id}`} className="break-words font-display text-2xl text-ivory">
              {c.type === "CABIN_CREW_CERT" ? "Cabin crew licence" : c.licenceCategory ?? "Licence"} {c.licenceNumber}
            </h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className={labelCls}>Status</dt>
                <dd className="mt-1 break-words text-ivory">{c.portalStatus ?? "unverified"}</dd>
              </div>
              <div>
                <dt className={labelCls}>Expires</dt>
                <dd className="mt-1 text-ivory"><Expiry date={c.expiresAt} /></dd>
              </div>
              <div>
                <dt className={labelCls}>Last checked</dt>
                <dd className="mt-1 text-ivory">{c.lastVerifiedAt ? formatDateTime(c.lastVerifiedAt) : "never"}</dd>
              </div>
            </dl>
            {isLumiConfigured() && (c.type === "PILOT_LICENCE" || c.type === "CABIN_CREW_CERT") && (
              <LumiVerifyPanel label={c.type === "CABIN_CREW_CERT" ? "your SACAA cabin crew licence" : "your SACAA licence"} />
            )}
            {c.ratings.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-tac">
                    <tr>
                      <th className="px-3 py-2.5">Rating</th>
                      <th className="px-3 py-2.5">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {c.ratings.map((r) => (
                      <tr key={r.id} className="align-top text-ivory/90">
                        <td className="break-words px-3 py-2.5">{r.name}</td>
                        <td className="px-3 py-2.5"><Expiry date={r.expiresAt} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <section aria-labelledby="medical-h" className={cardCls}>
          <h2 id="medical-h" className="font-display text-2xl text-ivory">Medical</h2>
          {person.medicals.length === 0 ? (
            <p className="mt-3 text-sm text-slate-tac">No medical on file.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/10">
              {person.medicals.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="text-ivory">Class {m.class}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-slate-tac">
                    Expires <Expiry date={m.expiresAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="logbook-h" className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="logbook-h" className="font-display text-2xl text-ivory">Logbook</h2>
            <Link href="/wallet/logbook" className={ghostBtnSm}>Open logbook →</Link>
          </div>
          {person.logbook || totals.entryCount > 0 ? (
            <>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-display text-4xl text-gold-gradient">{h1(totals.grand.totalHours)}</span>
                <span className="text-slate-tac">hrs total</span>
              </p>
              <p className="mt-1 text-sm text-slate-tac">
                {totals.entryCount > 0 ? `${h1(totals.logged.totalHours)} logged in ${totals.entryCount} flight${totals.entryCount === 1 ? "" : "s"}` : ""}
                {totals.entryCount > 0 && person.logbook ? " · " : ""}
                {person.logbook ? `${h1(totals.broughtForward.totalHours)} brought forward (as of ${formatDate(person.logbook.asOf)})` : ""}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-tac">Not uploaded</p>
          )}
        </section>
      </div>
    </main>
  );
}
