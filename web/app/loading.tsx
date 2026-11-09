/** Instant, quiet placeholder while a page streams in (keeps the navbar/footer steady instead of a blank flash). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32" aria-busy="true" aria-live="polite">
      <div className="h-3 w-28 animate-pulse rounded-full bg-gold/20" />
      <div className="mt-4 h-10 w-2/3 max-w-md animate-pulse rounded-xl bg-white/5" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-3xl bg-white/5" />
        <div className="h-32 animate-pulse rounded-3xl bg-white/5" />
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
