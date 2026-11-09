import { pageCls } from "@/components/ui/Field";

/** Shown while any /wallet page loads (the logbook page does real work before it can render). */
export default function WalletLoading() {
  return (
    <main className={pageCls} aria-busy="true">
      <p role="status" className="sr-only">Loading…</p>
      <div className="motion-safe:animate-pulse" aria-hidden>
        <div className="h-3 w-40 rounded-full bg-white/10" />
        <div className="mt-4 h-11 w-3/4 max-w-sm rounded-xl bg-white/10" />
        <div className="mt-10 space-y-6">
          <div className="glass h-44 rounded-3xl" />
          <div className="glass h-56 rounded-3xl" />
          <div className="glass h-44 rounded-3xl" />
        </div>
      </div>
    </main>
  );
}
