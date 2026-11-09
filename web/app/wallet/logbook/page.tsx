import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogbookClient, type LogbookEntryDTO } from "@/components/pilot/LogbookClient";
import { formatDate } from "@/components/pilot/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { pageCls } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { db } from "@/lib/db";
import { isLumiConfigured } from "@/lib/lumi";
import { computeCurrency, rollUp, syncPlatformFlights } from "@/lib/logbook";
import { providerConfigured } from "@/lib/logbook-connect";
import { getMfbStatus } from "@/lib/logbook-sync";
import { getPilotPersonId } from "@/lib/session";

type Flash = { tone: "ok" | "warn" | "err"; text: string };

// What the OAuth round trip tells the pilot. Keyed ONLY by the codes the callback sends, so nothing from the URL is ever
// echoed into the page (an unknown code shows nothing).
const CONNECT_FAILURES = new Map<string, Flash>([
  ["setup", { tone: "warn", text: "That connection isn't set up yet. You can still import a CSV or a PDF/photo below." }],
  ["denied", { tone: "warn", text: "Access wasn't approved on MyFlightbook, so nothing was imported." }],
  ["badstate", { tone: "warn", text: "That sign-in link expired or didn't match. Please try connecting again." }],
  ["tokenfail", { tone: "err", text: "MyFlightbook didn't respond as expected. Please try again in a few minutes." }],
  ["fetchfail", { tone: "err", text: "MyFlightbook didn't respond as expected. Please try again in a few minutes." }],
  ["savefail", { tone: "err", text: "We couldn't save your flights. Please try again." }],
  ["empty", { tone: "ok", text: "Connected. MyFlightbook has no flights we can import yet — add flights there and tap Sync now." }],
]);

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
/** A non-negative whole number from the URL, or null. */
const count = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && /^\d{1,6}$/.test(s) ? Number(s) : null;
};

/** Turn the OAuth callback's redirect params into a one-line banner for the pilot. */
function connectFlash(sp: Record<string, string | string[] | undefined>): Flash | null {
  if (one(sp.connected) === "myflightbook") {
    const imported = count(sp.count);
    const skipped = count(sp.skipped);
    const found = imported == null ? "" : ` — ${imported} flight${imported === 1 ? "" : "s"} imported`;
    const skippedText = skipped ? `, ${skipped} row${skipped === 1 ? "" : "s"} skipped` : "";
    return { tone: "ok", text: `Connected to MyFlightbook${found}${skippedText}.` };
  }
  const code = one(sp.connect);
  return (code && CONNECT_FAILURES.get(code)) || null;
}

export const metadata: Metadata = { title: "Logbook — Lumiritin" };
export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function LogbookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const personId = await getPilotPersonId();
  if (!personId) redirect("/auth/signin?next=/wallet/logbook");
  const flash = connectFlash(await searchParams);

  // Keep the pilot's platform flights logged and current before we read anything.
  await syncPlatformFlights(personId);

  const [person, entries, mfb] = await Promise.all([
    db.person.findUnique({ where: { id: personId }, select: { logbookProvider: true, logbookRef: true, logbook: true } }),
    db.flightLogEntry.findMany({ where: { personId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    getMfbStatus(personId),
  ]);

  const totals = rollUp(person?.logbook ?? null, entries);
  const currency = computeCurrency(entries);

  const dto: LogbookEntryDTO[] = entries.map((e) => ({
    id: e.id,
    date: iso(e.date),
    departureIcao: e.departureIcao,
    arrivalIcao: e.arrivalIcao,
    aircraftType: e.aircraftType,
    aircraftReg: e.aircraftReg,
    operatorName: e.operatorName,
    totalHours: Number(e.totalHours),
    picHours: num(e.picHours),
    coPilotHours: num(e.coPilotHours),
    dualHours: num(e.dualHours),
    instructorHours: num(e.instructorHours),
    nightHours: num(e.nightHours),
    instrumentHours: num(e.instrumentHours),
    multiEngineHours: num(e.multiEngineHours),
    turbineHours: num(e.turbineHours),
    dayLandings: e.dayLandings,
    nightLandings: e.nightLandings,
    certifier: e.certifier,
    source: e.source,
    verified: e.verified,
    remarks: e.remarks,
    external: e.externalSource != null,
  }));

  return (
    <main className={pageCls}>
      <PageHeader
        eyebrow="Your hours, verified"
        title="Logbook"
        action={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Pill tone={currency.passengerCurrent ? "ok" : "warn"}>{currency.passengerCurrent ? "Passenger-current" : "Not passenger-current"}</Pill>
            <p className="text-xs text-slate-tac">
              {currency.landings90} landing{currency.landings90 === 1 ? "" : "s"} in 90 days
              {currency.passengerCurrent && currency.lapsesAt ? ` · lapses ${formatDate(currency.lapsesAt)}` : " · need 3"}
            </p>
          </div>
        }
      />
      <LogbookClient
        entries={dto}
        totals={{ grand: totals.grand, broughtForward: totals.broughtForward, logged: totals.logged, entryCount: totals.entryCount, lastFlight: totals.lastFlight ? iso(totals.lastFlight) : null }}
        provider={person?.logbookProvider ?? null}
        providerRef={person?.logbookRef ?? null}
        broughtForwardHours={person?.logbook ? Number(person.logbook.totalHours) : 0}
        lumiLive={isLumiConfigured()}
        myFlightbookLive={providerConfigured("myflightbook")}
        mfb={mfb}
        flash={flash}
      />
    </main>
  );
}
