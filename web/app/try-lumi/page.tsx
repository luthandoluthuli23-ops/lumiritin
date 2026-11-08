import type { Metadata } from "next";
import Link from "next/link";
import { LumiTryPanel } from "@/components/pilot/LumiTryPanel";
import { isLumiConfigured } from "@/lib/lumi";

export const metadata: Metadata = { title: "Try Lumi — Lumiritin" };
export const dynamic = "force-dynamic";

export default function TryLumiPage() {
  const live = isLumiConfigured();

  return (
    <main className="mx-auto max-w-xl px-6 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Meet the concierge</p>
      <h1 className="mb-3 mt-3 font-display text-5xl text-ivory">Try Lumi</h1>
      <p className="mb-8 max-w-prose text-slate-tac">
        Lumi is Lumiritin&apos;s AI verification concierge. Upload a licence, logbook or AOC and it reads the
        document and pulls out the facts we check — licence number, ratings, medical and expiry — flagging
        anything that looks wrong. Try it here before you sign up. Nothing is saved.
      </p>

      {live ? (
        <LumiTryPanel />
      ) : (
        <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5 text-sm text-slate-tac">
          Lumi is on the way ✈️ — the live demo isn&apos;t switched on just yet. Check back soon.
        </div>
      )}

      <p className="mt-8 text-sm text-slate-tac">
        Ready for the real thing?{" "}
        <Link href="/auth/signup?role=pilot" className="text-gold-light underline underline-offset-4">Create a pilot account</Link>{" "}
        or{" "}
        <Link href="/auth/signin" className="text-gold-light underline underline-offset-4">sign in</Link>.
      </p>
    </main>
  );
}
