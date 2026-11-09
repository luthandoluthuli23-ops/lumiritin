import type { Metadata } from "next";
import Link from "next/link";
import { aircraftClass } from "@/lib/charter";
import { db } from "@/lib/db";
import { formatZar } from "@/lib/empty-legs-shared";
import { operatorRoster } from "@/lib/insights";
import { requireOperator } from "@/lib/session";
import { cardCls, primaryBtn } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { StatCards } from "@/components/operator/StatCards";
import { linkCls, standaloneLinkCls } from "@/components/operator/styles";
import { ReputationMini } from "@/components/insights/Reputation";
import { LumiVerifyPanel } from "@/components/pilot/LumiVerifyPanel";
import { isLumiConfigured } from "@/lib/lumi";

export const metadata: Metadata = { title: "Operator dashboard — Lumiritin" };

const CLASS_LABEL: Record<string, string> = Object.fromEntries(
  ["LIGHT_HELI", "MEDIUM_HELI", "HEAVY_HELI"].map((id) => [id, aircraftClass(id)!.label]),
);

export default async function OperatorDashboard() {
  const { operatorId, operatorName, isPrivate } = await requireOperator();
  const now = new Date();

  const [fleet, inquiries, inquiryCount, rosterCount, crewOpen, roster, orgRow] = await Promise.all([
    db.aircraft.count({ where: { operatorId } }),
    db.charterBooking.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.charterBooking.count({ where: { status: "REQUESTED" } }),
    db.crewRoster.count({ where: { operatorId } }),
    db.crewRequest.count({ where: { operatorId, status: "OPEN", endsAt: { gte: now } } }),
    operatorRoster(operatorId),
    db.operator.findUnique({ where: { id: operatorId }, select: { aocStatus: true, aocVerifiedAt: true } }),
  ]);
  const topCrew = roster.slice(0, 3);

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader
        title={`Good day, ${operatorName}`}
        subtitle="Your fleet, crew and charter demand at a glance."
        action={<Link href="/operator/crewing/new" className={primaryBtn}>Post crew request</Link>}
      />

      <StatCards
        stats={[
          { label: "Active fleet", value: fleet, href: "/operator/fleet" },
          { label: "Pending charter inquiries", value: inquiryCount, href: null, note: "open to all operators" },
          { label: "Pilots on roster", value: rosterCount, href: "/operator/pilots" },
          { label: "Open crew requests", value: crewOpen, href: "/operator/crewing" },
        ]}
      />

      {!isPrivate && isLumiConfigured() && (
        <section className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-ivory">AOC verification</h2>
            {orgRow?.aocVerifiedAt ? (
              <Pill tone="ok">
                Verified{orgRow.aocStatus ? ` · ${orgRow.aocStatus}` : ""} · {new Date(orgRow.aocVerifiedAt).toLocaleDateString("en-ZA")}
              </Pill>
            ) : (
              <Pill>Unverified</Pill>
            )}
          </div>
          <LumiVerifyPanel
            endpoint="/api/operator/verify-aoc"
            description="Upload your SACAA Air Operator Certificate (AOC) — a PDF or a clear photo. Lumi reads it and confirms your operator credentials in seconds. Nothing is shared publicly."
          />
        </section>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section className={cardCls}>
          <h2 className="font-display text-2xl text-ivory">Latest charter inquiries</h2>
          {inquiries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-tac">No open inquiries right now.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {inquiries.map((b) => {
                const route = b.legs as { fromIcao: string; toIcao: string; date: string }[];
                return (
                  <li key={b.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0 break-words">
                      <p className="text-ivory">{route.map((l) => `${l.fromIcao}→${l.toIcao}`).join(" · ")}</p>
                      <p className="text-xs text-slate-tac">{b.reference} · {CLASS_LABEL[b.aircraftClass] ?? b.aircraftClass} · {b.passengers} pax · {route[0]?.date}</p>
                    </div>
                    <span className="whitespace-nowrap text-gold-light">≈ {formatZar(b.estimatedPriceZar)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <h2 className="font-display text-2xl text-ivory">Your top crew</h2>
            <Link href="/operator/insights" className={standaloneLinkCls}>Insights →</Link>
          </div>
          {topCrew.length === 0 ? (
            <p className="mt-4 text-sm text-slate-tac">
              List your pilots to see their reliability and rank them. <Link href="/operator/pilots" className={linkCls}>Add crew →</Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {topCrew.map((p) => (
                <li key={p.personId} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0 break-words text-ivory">{p.fullName}</span>
                  <ReputationMini reputation={p.reputation} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
