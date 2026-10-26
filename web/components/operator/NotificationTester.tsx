"use client";

import { useState, type FormEvent } from "react";

const inputCls = "mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-ivory outline-none transition placeholder:text-slate-tac/60 focus:border-gold/60";
const btnCls = "mt-3 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-obsidian transition hover:bg-gold-light disabled:opacity-60";

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
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onEmail} className="glass rounded-3xl p-6">
        <h3 className="font-display text-2xl text-ivory">Test email</h3>
        <p className="mt-1 text-sm text-slate-tac">Sends a test email so you can confirm delivery.</p>
        <label className="mt-4 block text-xs uppercase tracking-widest text-slate-tac">Send to</label>
        <input name="target" type="email" required defaultValue={defaultEmail} placeholder="you@example.com" className={inputCls} />
        <button type="submit" disabled={email.busy} className={btnCls}>{email.busy ? "Sending…" : "Send test email"}</button>
        {email.msg && <p className={`mt-3 text-sm ${email.msg.ok ? "text-emerald-status" : "text-alert"}`}>{email.msg.text}</p>}
      </form>

      <form onSubmit={onWa} className="glass rounded-3xl p-6">
        <h3 className="font-display text-2xl text-ivory">Test WhatsApp</h3>
        <p className="mt-1 text-sm text-slate-tac">Sends the pre-approved &ldquo;hello_world&rdquo; template to a verified number.</p>
        <label className="mt-4 block text-xs uppercase tracking-widest text-slate-tac">Send to (international format)</label>
        <input name="target" required placeholder="+27821234567" className={inputCls} />
        <button type="submit" disabled={wa.busy} className={btnCls}>{wa.busy ? "Sending…" : "Send test WhatsApp"}</button>
        {wa.msg && <p className={`mt-3 text-sm ${wa.msg.ok ? "text-emerald-status" : "text-alert"}`}>{wa.msg.text}</p>}
      </form>
    </div>
  );
}
