import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogbookClient, type LogbookEntryDTO } from "@/components/pilot/LogbookClient";
import { db } from "@/lib/db";
import { isLumiConfigured } from "@/lib/lumi";
import { computeCurrency, rollUp, syncPlatformFlights } from "@/lib/logbook";
import { providerConfigured } from "@/lib/logbook-connect";
import { getPilotPersonId } from "@/lib/session";

/** Turn the OAuth callback's redirect params into a one-line banner for the pilot. */
function connectFlash(sp: Record<string, string | undefined>): { tone: "ok" | "err"; text: string } | null {
  if (sp.connected) {
    const c = Number(sp.count ?? 0);
    return { tone: "ok", text: `Connected to ${sp.connected === "myflightbook" ? "MyFlightbook" : sp.connected} — ${c} flight${c === 1 ? "" : "s"} imported.` };
  }
  if (sp.connect === "setup") return { tone: "err", text: "That connection isn't set up yet. You can still import a CSV or a PDF/photo below." };
  if (sp.connect === "denied") return { tone: "err", text: "Authorization was cancelled, so nothing was imported." };
  if (sp.connect) return { tone: "err", text: "Couldn't complete the connection. Please try again, or import a file below." };
  return null;
}

export const metadata: Metadata = { title: "Logbook — Lumiritin" };
export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function LogbookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const personId = await getPilotPersonId();
  if (!personId) redirect("/auth/signin?next=/wallet/logbook");
  const flash = connectFlash(await searchParams);

  // Keep the pilot's platform flights logged and current before we read anything.
  await syncPlatformFlights(personId);

  const [person, entries] = await Promise.all([
    db.person.findUnique({ where: { id: personId }, select: { logbookProvider: true, logbookRef: true, logbook: true } }),
    db.flightLogEntry.findMany({ where: { personId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
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
  }));

  return (
    <LogbookClient
      entries={dto}
      totals={{ grand: totals.grand, broughtForward: totals.broughtForward, logged: totals.logged, entryCount: totals.entryCount, lastFlight: totals.lastFlight ? iso(totals.lastFlight) : null }}
      currency={{
        passengerCurrent: currency.passengerCurrent,
        landings90: currency.landings90,
        lapsesAt: currency.lapsesAt ? iso(currency.lapsesAt) : null,
        nightCurrent: currency.nightCurrent,
        nightLandings90: currency.nightLandings90,
      }}
      provider={person?.logbookProvider ?? null}
      providerRef={person?.logbookRef ?? null}
      broughtForwardHours={person?.logbook ? Number(person.logbook.totalHours) : 0}
      lumiLive={isLumiConfigured()}
      myFlightbookLive={providerConfigured("myflightbook")}
      flash={flash}
    />
  );
}
