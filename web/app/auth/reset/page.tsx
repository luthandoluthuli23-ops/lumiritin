import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/auth/ResetForms";

// no-referrer: the token is in the URL, so it must not leak to any other site this page loads from.
export const metadata: Metadata = { title: "Set a new password — Lumiritin", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mb-8 mt-3 font-display text-5xl text-ivory">Set a new password</h1>
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-sm text-slate-tac">
          This page needs the link from your reset email.{" "}
          <Link href="/auth/forgot" className="text-gold-light underline underline-offset-4">
            Send a new link
          </Link>
        </p>
      )}
    </main>
  );
}
