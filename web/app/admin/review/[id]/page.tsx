import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewDecisionForm } from "@/components/admin/ReviewDecisionForm";
import { formatDateTime } from "@/components/pilot/format";
import { Alert } from "@/components/ui/Alert";
import { cardCls, ghostBtnSm, pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { getReviewer } from "@/lib/reviewers";

export const metadata: Metadata = { title: "Review submission — Lumiritin", robots: { index: false } };
export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getReviewer();
  if (!reviewer) notFound();

  const sub = await db.verificationSubmission.findUnique({
    where: { id: (await params).id },
    include: {
      documents: { select: { id: true, kind: true, mediaType: true, sizeBytes: true } },
      person: { select: { fullName: true, credentials: { select: { type: true, licenceNumber: true, licenceCategory: true } } } },
    },
  });
  if (!sub) notFound();

  const profileLicence = sub.person.credentials.find((c) => c.type === "PILOT_LICENCE") ?? sub.person.credentials[0];
  const lumi = sub.lumiPrefill as { holderName?: string; licenceNumber?: string; licenceType?: string; expires?: string; medical?: { class?: number; expires?: string }; confidence?: number; issues?: string[] } | null;

  const rows: [string, string, string, string][] = [
    ["Name", sub.person.fullName, sub.holderName, lumi?.holderName ?? "—"],
    ["Licence number", profileLicence?.licenceNumber ?? "—", sub.licenceNumber, lumi?.licenceNumber ?? "—"],
    ["Licence type", profileLicence?.licenceCategory ?? "—", sub.licenceType ?? "—", lumi?.licenceType ?? "—"],
    ["Licence expiry", "", iso(sub.licenceExpiresAt), lumi?.expires ?? "—"],
    ["Medical", "", sub.medicalClass ? `Class ${sub.medicalClass}, expires ${iso(sub.medicalExpiresAt)}` : "—", lumi?.medical ? `Class ${lumi.medical.class ?? "?"}, expires ${lumi.medical.expires ?? "?"}` : "—"],
    ["Ratings", "", sub.ratings.join(", ") || "—", ""],
  ];

  return (
    <main className={pageCls}>
      <PageHeader eyebrow="Reviewer" title={sub.person.fullName} subtitle={`Sent ${formatDateTime(sub.createdAt)} · status ${sub.status}`} action={<Link href="/admin/review" className={ghostBtnSm}>← Queue</Link>} />

      <section className={`${cardCls} mt-8 overflow-x-auto`}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-tac">
            <tr><th className="py-2 pr-4">Field</th><th className="py-2 pr-4">Profile</th><th className="py-2 pr-4">Pilot entered</th><th className="py-2">Lumi read (hint only)</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-ivory">
            {rows.map(([k, a, b, c]) => (
              <tr key={k}><td className="py-2 pr-4 text-slate-tac">{k}</td><td className="py-2 pr-4">{a}</td><td className="py-2 pr-4">{b}</td><td className="py-2 text-slate-tac">{c}</td></tr>
            ))}
          </tbody>
        </table>
        {lumi?.issues?.length ? <p className="mt-3 text-xs text-warn">Lumi flagged: {lumi.issues.join("; ")}</p> : null}
        <p className="mt-3 text-xs text-slate-tac">Lumi&rsquo;s reading is a convenience. Decide from the documents themselves.</p>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        {sub.documents.length === 0 ? (
          <Alert tone="info">The documents for this submission have been deleted (retention or withdrawal).</Alert>
        ) : (
          sub.documents.map((d) => (
            <figure key={d.id} className={cardCls}>
              <figcaption className="mb-3 text-xs uppercase tracking-widest text-slate-tac">{d.kind === "LICENCE" ? "Licence" : "Medical certificate"}</figcaption>
              {d.mediaType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/documents/${d.id}`} alt={`${d.kind} uploaded by the pilot`} className="max-h-[32rem] w-full rounded-xl object-contain" referrerPolicy="no-referrer" />
              ) : (
                <a href={`/api/admin/documents/${d.id}`} className={ghostBtnSm}>Download PDF ({Math.round(d.sizeBytes / 1024)} KB)</a>
              )}
            </figure>
          ))
        )}
      </section>

      {sub.status === "PENDING" && (
        <section className={`${cardCls} mt-6`}>
          <h2 className="mb-4 font-display text-2xl text-ivory">Decision</h2>
          <ReviewDecisionForm submissionId={sub.id} />
        </section>
      )}
    </main>
  );
}
