"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { TextField, cardCls, primaryBtn } from "@/components/ui/Field";

function useTester(channel: "email" | "whatsapp") {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(target: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/operator/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, target }),
      });
      const data = await res.json().catch(() => null);
      setMsg({ ok: Boolean(data?.ok), text: data?.message ?? (res.ok ? "Sent." : "Something went wrong.") });
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, send };
}

export function NotificationTester({ defaultEmail = "" }: { defaultEmail?: string }) {
  const email = useTester("email");
  const wa = useTester("whatsapp");
  const onEmail = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    email.send(String(new FormData(e.currentTarget).get("target") ?? ""));
  };
  const onWa = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    wa.send(String(new FormData(e.currentTarget).get("target") ?? ""));
  };

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
      <form onSubmit={onEmail} className={cardCls}>
        <h2 className="font-display text-2xl text-ivory">Test email</h2>
        <p className="mt-1 text-sm text-slate-tac">Sends a test email so you can confirm delivery.</p>
        <div className="mt-4">
          <TextField label="Send to" name="target" type="email" required autoComplete="email" defaultValue={defaultEmail} placeholder="you@example.com" />
        </div>
        <button type="submit" disabled={email.busy} className={`${primaryBtn} mt-4`}>{email.busy ? "Sending…" : "Send test email"}</button>
        {email.msg && <Alert tone={email.msg.ok ? "ok" : "err"} className="mt-4">{email.msg.text}</Alert>}
      </form>

      <form onSubmit={onWa} className={cardCls}>
        <h2 className="font-display text-2xl text-ivory">Test WhatsApp</h2>
        <p className="mt-1 text-sm text-slate-tac">Sends the pre-approved &ldquo;hello_world&rdquo; template to a verified number.</p>
        <div className="mt-4">
          <TextField label="Send to (international format)" name="target" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+27821234567" />
        </div>
        <button type="submit" disabled={wa.busy} className={`${primaryBtn} mt-4`}>{wa.busy ? "Sending…" : "Send test WhatsApp"}</button>
        {wa.msg && <Alert tone={wa.msg.ok ? "ok" : "err"} className="mt-4">{wa.msg.text}</Alert>}
      </form>
    </div>
  );
}
