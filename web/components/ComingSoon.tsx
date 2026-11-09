import Link from "next/link";
import { pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";

/** Placeholder for routes that are planned but not built yet, so navigation never 404s. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main className={`${pageCls} flex min-h-[60dvh] flex-col justify-center`}>
      <PageHeader eyebrow="In development" title={title} subtitle={blurb} />
      <Link href="/" className="mt-8 inline-flex items-center self-start text-sm text-gold-light underline underline-offset-4 pointer-coarse:min-h-11">
        ← Back to home
      </Link>
    </main>
  );
}
