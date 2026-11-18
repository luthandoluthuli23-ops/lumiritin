import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/components/pilot/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { pageCls, rowCardCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { getReviewer } from "@/lib/reviewers";

export const metadata: Metadata = { title: "Review queue — Lumiritin", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Reviewer-only (REVIEWER_EMAILS). Anyone else gets a plain 404, so the page's existence isn't revealed. */
export default async function ReviewQueuePage() {
  const reviewer = await getReviewer();
  if (!reviewer) notFound();

  const [pending, recent] = await Promise.all([
    db.verificationSubmission.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { person: { select: { fullName: true } } } }),
    db.verificationSubmission.findMany({ where: { status: "DECIDED" }, orderBy: { decidedAt: "desc" }, take: 20, include: { person: { select: { fullName: true } } } }),
  ]);

  return (
    <main className={pageCls}>
      <PageHeader eyebrow="Reviewer" title="Verification review queue" subtitle={`Signed in as ${reviewer}. Oldest first.`} />
      <section className="mt-8 space-y-3">
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting">New submissions appear here.</EmptyState>
        ) : (
          pending.map((s) => (
            <Link key={s.id} href={`/admin/review/${s.id}`} className={`${rowCardCls} flex flex-wrap items-center justify-between gap-3 hover:border-gold/40`}>
              <span className="text-ivory">{s.person.fullName}</span>
              <span className="text-sm text-slate-tac">Sent {formatDateTime(s.createdAt)}</span>
            </Link>
          ))
        )}
      </section>
      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl text-ivory">Recently decided</h2>
          <ul className="mt-4 divide-y divide-white/10 text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-3 py-3">
                <span className="text-ivory">{s.person.fullName}</span>
                <span className="text-slate-tac">
                  {s.decision} by {s.reviewer} · {s.decidedAt ? formatDateTime(s.decidedAt) : ""}
                  {s.documentsPurgedAt ? " · documents deleted" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
