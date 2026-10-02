import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SigninForm } from "@/components/auth/SigninForm";
import { ROLE_HOME, safeNextPath } from "@/lib/roles";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in — Lumiritin" };
export const dynamic = "force-dynamic";

export default async function SigninPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  if (session) redirect(ROLE_HOME[session.role]);

  return (
    <main className="mx-auto max-w-md px-6 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Welcome back</p>
      <h1 className="mb-8 mt-3 font-display text-5xl text-ivory">Sign in</h1>
      <SigninForm next={safeNextPath(sp.next)} />
      <p className="mt-6 text-sm text-slate-tac">
        New to Lumiritin?{" "}
        <Link href="/auth/signup" className="text-gold-light underline underline-offset-4">Create an account</Link>
      </p>
    </main>
  );
}
