import Link from "next/link";

/** Placeholder for routes that are planned but not built yet, so navigation never 404s. */
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 pb-16 pt-28">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">In development</p>
      <h1 className="font-display text-5xl text-ivory">{title}</h1>
      <p className="mt-4 max-w-xl text-slate-tac">{blurb}</p>
      <Link href="/" className="mt-8 text-sm text-gold-light underline underline-offset-4">
        ← Back to home
      </Link>
    </main>
  );
}
