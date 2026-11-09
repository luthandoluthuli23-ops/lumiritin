"use client";

import Link from "next/link";
import { ghostBtn, pageCls, primaryBtn } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";

/** Shown when a page throws while rendering. The digest lets support find the server log entry. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={`${pageCls} max-w-xl`}>
      <PageHeader eyebrow="Something went wrong" title="We hit turbulence" subtitle="That page couldn't load. It's on our side, not yours. Try again, or head back to the start." />
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={primaryBtn}>
          Try again
        </button>
        <Link href="/" className={`${ghostBtn} inline-flex items-center justify-center`}>
          Back to home
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-slate-tac">Reference: {error.digest}</p>}
    </main>
  );
}
