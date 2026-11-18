import type { Metadata } from "next";
import Link from "next/link";
import { VerificationBadge } from "@/components/pilot/VerificationBadge";
import { VerificationForm } from "@/components/pilot/VerificationForm";
import { formatDateTime } from "@/components/pilot/format";
import { Alert } from "@/components/ui/Alert";
import { cardCls, pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { isDocumentStorageConfigured } from "@/lib/documents";
import { requireRole } from "@/lib/session";
import { HELP_FALLBACK } from "@/lib/site-contact";
import { PROFILE_STATE_SELECT, stateOf } from "@/lib/verification-checks";
import { VERIFICATION_CONSENT_TEXT, VERIFICATION_CONSENT_VERSION } from "@/lib/verification-consent";

export const metadata: Metadata = { title: "Verify my licence — Lumiritin" };
export const dynamic = "force-dynamic";

const DECISION_TEXT = {
  VERIFIED: "Verified: your details matched your documents.",
  MISMATCH: "Your details didn't match your documents. Check them and send them again.",
  UNREADABLE: "We couldn't read your documents. Please send clearer photos.",
} as const;

export default async function VerifyMyLicencePage() {
  const session = await requireRole("PILOT", "/wallet/verify");
  const person = await db.person.findFirst({
    where: { user: { id: session.sub } },
    select: {
      ...PROFILE_STATE_SELECT,
      fullName: true,
      credentials: { select: { type: true, licenceNumber: true, licenceCategory: true, expiresAt: true, ratings: { select: { expiresAt: true } } }, orderBy: { createdAt: "asc" } },
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, decision: true, createdAt: true, decidedAt: true } },
    },
  });
  if (!person) return <main className={pageCls}><Alert tone="info">Finish setting up your pilot profile first.</Alert></main>;

  const state = stateOf(person);
  const latest = person.submissions[0];
  const licence = person.credentials.find((c) => c.type === "PILOT_LICENCE") ?? person.credentials[0];

  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="Verification" title="Verify my licence" subtitle="Send us your licence and medical so a reviewer can check your profile against SACAA records." />

      <section className={`${cardCls} mt-8`}>
        <h2 className="font-display text-2xl text-ivory">Your status</h2>
        <VerificationBadge state={state} lastPassAt={person.lastPassAt} className="mt-3" />
        {latest?.status === "DECIDED" && latest.decision && (
          <p className="mt-3 text-sm text-slate-tac">Last review ({latest.decidedAt ? formatDateTime(latest.decidedAt) : "—"}): {DECISION_TEXT[latest.decision]}</p>
        )}
      </section>

      <section className={`${cardCls} mt-6`}>
        {latest?.status === "PENDING" ? (
          <Alert tone="info" title="Waiting for review">
            We received your documents on {formatDateTime(latest.createdAt)}. A reviewer will check them and your status will update here. {HELP_FALLBACK}
          </Alert>
        ) : !isDocumentStorageConfigured() ? (
          <Alert tone="warn" title="Uploads aren't switched on yet">Document uploads will be available soon. {HELP_FALLBACK}</Alert>
        ) : (
          <VerificationForm
            consentText={VERIFICATION_CONSENT_TEXT}
            consentVersion={VERIFICATION_CONSENT_VERSION}
            defaults={{ holderName: person.fullName, licenceNumber: licence?.licenceNumber ?? "", licenceType: licence?.licenceCategory ?? "" }}
          />
        )}
      </section>

      <p className="mt-6 text-sm text-slate-tac">
        Why photos? SACAA&rsquo;s licensing portal sends a one-time PIN to your phone, so we can&rsquo;t check silently.{" "}
        <Link href="/verification" className="underline underline-offset-4 hover:text-ivory">How verification works</Link> ·{" "}
        <Link href="/wallet/settings" className="underline underline-offset-4 hover:text-ivory">Withdraw consent</Link>
      </p>
    </main>
  );
}
