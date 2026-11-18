import type { Metadata } from "next";
import { ConsentSettings } from "@/components/pilot/ConsentSettings";
import { cardCls, pageCls } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Settings — Lumiritin" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireRole("PILOT", "/wallet/settings");
  const person = await db.person.findFirst({
    where: { user: { id: session.sub } },
    select: { consents: { where: { revokedAt: null }, orderBy: { grantedAt: "desc" } } },
  });
  const active = (scope: string) => person?.consents.find((c) => c.scope === scope) ?? null;
  const v = active("sacaa_verification");
  const w = active("whatsapp_notifications");

  return (
    <main className={`${pageCls} max-w-3xl`}>
      <PageHeader eyebrow="Wallet" title="Settings" subtitle="Your consents. You can withdraw any of them at any time." />
      <section className={`${cardCls} mt-8`}>
        <ConsentSettings
          consents={[
            {
              scope: "sacaa_verification",
              title: "Verification against SACAA records",
              description: "Lets a reviewer check your profile against your SACAA licence and medical. Withdrawing makes your profile unverified, and deletes any documents waiting for review.",
              active: Boolean(v),
              grantedAt: v?.grantedAt.toISOString() ?? null,
              textVersion: v?.textVersion ?? null,
            },
            {
              scope: "whatsapp_notifications",
              title: "WhatsApp messages",
              description: "Expiry warnings and verification updates on WhatsApp.",
              active: Boolean(w),
              grantedAt: w?.grantedAt.toISOString() ?? null,
              textVersion: w?.textVersion ?? null,
            },
          ]}
        />
      </section>
    </main>
  );
}
