import type { Metadata } from "next";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { requireOperator } from "@/lib/session";
import { isWhatsappConfigured } from "@/lib/whatsapp";
import { NotificationTester } from "@/components/operator/NotificationTester";

export const metadata: Metadata = { title: "Notifications — Lumiritin" };

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm ${on ? "bg-emerald-status/15 text-emerald-status" : "bg-white/5 text-slate-tac"}`}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-status" : "bg-slate-tac"}`} />
      {label}: {on ? "Configured" : "Not configured"}
    </span>
  );
}

export default async function OperatorNotificationsPage() {
  const { userId } = await requireOperator();
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  const emailOn = isEmailConfigured();
  const waOn = isWhatsappConfigured();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-5xl text-ivory">Notifications</h1>
        <p className="mt-2 max-w-2xl text-slate-tac">
          Lumiritin pings crew on WhatsApp and emails booking confirmations. Check the channels are live, then send
          yourself a test.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <StatusPill on={emailOn} label="Email" />
        <StatusPill on={waOn} label="WhatsApp" />
      </div>

      <NotificationTester defaultEmail={user?.email ?? ""} />

      <details className="glass rounded-3xl p-6">
        <summary className="cursor-pointer font-display text-2xl text-ivory">How to switch these on</summary>
        <div className="mt-4 space-y-5 text-sm text-slate-tac">
          <div>
            <p className="text-gold">Email (Resend) — fastest</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Create a free account at resend.com and make an API key.</li>
              <li>In Vercel → your project → Settings → Environment Variables, add <code className="text-ivory">RESEND_API_KEY</code>.</li>
              <li>Redeploy. Until you verify a domain, email sends only to your own Resend account address, and from <code className="text-ivory">onboarding@resend.dev</code> — fine for testing. For production, verify a domain and set <code className="text-ivory">EMAIL_FROM</code>.</li>
            </ol>
          </div>
          <div>
            <p className="text-gold">WhatsApp (Meta Cloud API)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>At developers.facebook.com create an app (Business type) and add the WhatsApp product.</li>
              <li>On API Setup, add your phone as a verified recipient, then copy the temporary <b>access token</b> and the <b>phone number ID</b>.</li>
              <li>In Vercel add <code className="text-ivory">WHATSAPP_TOKEN</code> and <code className="text-ivory">WHATSAPP_PHONE_NUMBER_ID</code>, and redeploy.</li>
              <li>The test above uses Meta&rsquo;s pre-approved <code className="text-ivory">hello_world</code> template, so it works before your own templates (crew ping, expiry reminder) are approved.</li>
            </ol>
          </div>
        </div>
      </details>
    </div>
  );
}
