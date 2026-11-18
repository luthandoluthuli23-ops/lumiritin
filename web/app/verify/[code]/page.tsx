import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerificationBadge } from "@/components/pilot/VerificationBadge";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { PROFILE_STATE_SELECT, stateOf } from "@/lib/verification-checks";
import { formatBadgeDate, STATE_LABEL } from "@/lib/verification-state";

export const metadata: Metadata = { title: "Crew verification — Lumiritin", robots: { index: false } };
export const dynamic = "force-dynamic";

const CODE_RE = /^[a-f0-9]{12}$/;

/**
 * Public check page for one crew profile, reached by the pilot's share code. Shows ONLY name, licence type, state and
 * last-verified date: no contact details, no licence number, no documents. The code is unguessable; an unknown or
 * malformed code is a plain 404 (no hint whether a pilot exists).
 */
export default async function PublicVerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE_RE.test(code)) notFound();

  const person = await db.person.findUnique({
    where: { publicCode: code },
    select: {
      fullName: true,
      ...PROFILE_STATE_SELECT,
      credentials: { select: { type: true, licenceCategory: true, expiresAt: true, ratings: { select: { expiresAt: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!person) notFound();

  const state = stateOf(person);
  const licence = person.credentials.find((c) => c.type === "PILOT_LICENCE") ?? person.credentials[0];
  const licenceType = licence ? (licence.type === "CABIN_CREW_CERT" ? "Cabin crew licence" : licence.licenceCategory ?? "Pilot licence") : "—";

  return (
    <main className={`${pageCls} max-w-xl`}>
      <PageHeader eyebrow="Crew verification" title={person.fullName} />
      <dl className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/10">
        {[
          ["Licence type", licenceType],
          ["State", STATE_LABEL[state]],
          ["Last verified", person.lastPassAt ? formatBadgeDate(person.lastPassAt) : "Never"],
        ].map(([k, v]) => (
          <div key={k} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="text-slate-tac">{k}</dt>
            <dd className="text-ivory">{v}</dd>
          </div>
        ))}
      </dl>
      <VerificationBadge state={state} lastPassAt={person.lastPassAt} className="mt-6" />
      <p className="mt-6 text-xs text-slate-tac">
        Lumiritin is pre-launch. Verification results are for testing and must not be relied on for operational decisions. The SACAA
        record is always the authority.
      </p>
    </main>
  );
}
