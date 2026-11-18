"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { dangerBtn } from "@/components/ui/Field";

interface ConsentRow {
  scope: "sacaa_verification" | "whatsapp_notifications";
  title: string;
  description: string;
  active: boolean;
  grantedAt: string | null;
  textVersion: string | null;
}

/** Lists the pilot's consents and lets them withdraw each one (with a confirm step). */
export function ConsentSettings({ consents }: { consents: ConsentRow[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function withdraw(scope: ConsentRow["scope"]) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pilot/consent", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      if (!res.ok) throw new Error();
      setMessage({ tone: "ok", text: scope === "sacaa_verification" ? "Consent withdrawn. Your profile is now unverified and any documents waiting for review were deleted." : "Consent withdrawn. We won't send you WhatsApp messages." });
      setConfirm(null);
      router.refresh();
    } catch {
      setMessage({ tone: "err", text: "That didn't work. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {consents.map((c) => (
        <div key={c.scope} className="rounded-2xl border border-white/10 p-5">
          <h3 className="font-semibold text-ivory">{c.title}</h3>
          <p className="mt-1 text-sm text-slate-tac">{c.description}</p>
          <p className="mt-2 text-xs text-slate-tac">
            {c.active ? `Given ${c.grantedAt ? new Date(c.grantedAt).toLocaleDateString("en-ZA") : ""}${c.textVersion ? ` (version ${c.textVersion})` : ""}` : "Not given"}
          </p>
          {c.active &&
            (confirm === c.scope ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-ivory">{c.scope === "sacaa_verification" ? "Your profile will become unverified. Continue?" : "Stop WhatsApp messages?"}</span>
                <button type="button" disabled={busy} onClick={() => withdraw(c.scope)} className={dangerBtn}>Yes, withdraw</button>
                <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="text-sm text-slate-tac underline underline-offset-4 pointer-coarse:min-h-11">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirm(c.scope)} className={`${dangerBtn} mt-3`}>Withdraw consent</button>
            ))}
        </div>
      ))}
    </div>
  );
}
