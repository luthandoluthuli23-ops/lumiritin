import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "@/components/auth/ResetForms";

export const metadata: Metadata = { title: "Forgot password — Lumiritin", robots: { index: false } };

export default function ForgotPage() {
  return (
    <main className="mx-auto max-w-md px-6 pb-24 pt-36">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mb-3 mt-3 font-display text-5xl text-ivory">Forgot password</h1>
      <p className="mb-8 text-sm text-slate-tac">Enter the email you signed up with and we&apos;ll send you a link to set a new password.</p>
      <ForgotForm />
      <p className="mt-6 text-sm text-slate-tac">
        Remembered it?{" "}
        <Link href="/auth/signin" className="text-gold-light underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
