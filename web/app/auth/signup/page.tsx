import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupFlow } from "@/components/auth/SignupFlow";
import { listAirfields } from "@/lib/airfield-db";
import { ROLE_HOME, safeNextPath } from "@/lib/roles";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account — Lumiritin" };
export const dynamic = "force-dynamic";

const ROLE_PARAM = { passenger: "PASSENGER", operator: "OPERATOR", pilot: "PILOT" } as const;

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp, airfields] = await Promise.all([getSession(), searchParams, listAirfields()]);
  if (session) redirect(ROLE_HOME[session.role]);

  const initialRole = ROLE_PARAM[(sp.role ?? "") as keyof typeof ROLE_PARAM] ?? null;

  return (
    <main className="px-6 pb-24 pt-32">
      <div className="mx-auto mb-10 max-w-5xl">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Join Lumiritin</p>
        <h1 className="mt-3 font-display text-5xl text-ivory sm:text-6xl">How will you fly with us?</h1>
        <p className="mt-3 text-slate-tac">
          Already have an account?{" "}
          <Link href="/auth/signin" className="text-gold-light underline underline-offset-4">Sign in</Link>
        </p>
      </div>
      <SignupFlow airfields={airfields} initialRole={initialRole} next={safeNextPath(sp.next)} />
    </main>
  );
}
