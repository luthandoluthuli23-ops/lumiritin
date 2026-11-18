import type { Metadata } from "next";
import { RespondCard } from "@/components/pilot/RespondCard";
import { loadPingView } from "@/lib/crew-ping-view";

export const metadata: Metadata = { title: "Crew request — Lumiritin", robots: { index: false } };
export const dynamic = "force-dynamic";

// Public by design: the unguessable token in the URL (sent by WhatsApp) is the credential, so pilots can respond
// from their phone in one tap. The link stops working as soon as the ping is answered, expires or is cancelled.
// The request is loaded on the server, so the page shows real content on first load (no "Loading…" state).
export default async function RespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const initial = await loadPingView(token);
  return (
    <main className="mx-auto max-w-xl px-6 pb-24 pt-32">
      <RespondCard token={token} initial={initial} />
    </main>
  );
}
