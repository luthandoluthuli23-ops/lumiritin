import type { Metadata } from "next";
import { RespondCard } from "@/components/pilot/RespondCard";

export const metadata: Metadata = { title: "Crew request — Lumiritin", robots: { index: false } };

// Public by design: the unguessable token in the URL (sent by WhatsApp) is the credential, so pilots can respond
// from their phone in one tap. The link stops working as soon as the ping is answered, expires or is cancelled.
export default async function RespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-xl px-6 pb-24 pt-32">
      <RespondCard token={token} />
    </main>
  );
}
