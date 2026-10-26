// Transactional email via Resend (https://resend.com). Gated on RESEND_API_KEY the same way
// WhatsApp is gated on its token: without the key it logs a dry-run instead of sending, so the app
// works in dev and never breaks a request if email is down. Never throws.
import { formatZar } from "@/lib/empty-legs-shared";

const RESEND_URL = "https://api.resend.com/emails";
// Resend lets you send from this address to your own account email with no domain verification —
// ideal for testing. Set EMAIL_FROM to a verified domain address for production.
const FROM = process.env.EMAIL_FROM ?? "Lumiritin <onboarding@resend.dev>";

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:dry-run] to ${msg.to}: ${msg.subject}`);
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] failed HTTP ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Minimal branded wrapper ──────────────────────────────────────────────────
function shell(bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#0b0f17;color:#e9e4d8;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#121826;border:1px solid #ffffff14;border-radius:16px;padding:28px">
      <p style="font-size:22px;color:#e2b857;margin:0 0 16px;font-weight:600">Lumiritin</p>
      ${bodyHtml}
      <p style="margin-top:24px;font-size:12px;color:#8b97ab">Lumiritin — private aviation charter, South Africa. This is a notification, not a booking confirmation; an operator confirms availability and the final price.</p>
    </div>
  </div>`;
}

export async function sendCharterConfirmation(p: { to: string; name: string; reference: string; priceZar: number; route: string; date: string }): Promise<void> {
  const html = shell(
    `<p style="font-size:16px">Hi ${escapeHtml(p.name.split(" ")[0] || p.name)},</p>
     <p>We've received your charter request. Reference <b style="color:#e2b857">${escapeHtml(p.reference)}</b>.</p>
     <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px">
       <tr><td style="padding:6px 0;color:#8b97ab">Route</td><td style="text-align:right">${escapeHtml(p.route)}</td></tr>
       <tr><td style="padding:6px 0;color:#8b97ab">Date</td><td style="text-align:right">${escapeHtml(p.date)}</td></tr>
       <tr><td style="padding:6px 0;color:#8b97ab">Estimate</td><td style="text-align:right">${formatZar(p.priceZar)} excl. VAT &amp; fees</td></tr>
     </table>
     <p style="margin-top:16px">An operator will confirm availability and a firm price shortly. Nothing has been charged.</p>`,
  );
  await sendEmail({ to: p.to, subject: `Your Lumiritin charter request ${p.reference}`, html });
}

export async function sendExpiryReminderEmail(p: { to: string; name: string; item: string; expiresOn: string; daysLeft: number }): Promise<{ ok: boolean; error?: string }> {
  const when = p.daysLeft <= 0 ? "has expired" : `expires in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}`;
  const html = shell(
    `<p style="font-size:16px">Hi ${escapeHtml(p.name)},</p>
     <p>Your <b style="color:#e2b857">${escapeHtml(p.item)}</b> ${when} — on <b>${escapeHtml(p.expiresOn)}</b>.</p>
     <p>Renew it to stay current and keep receiving duty offers on Lumiritin.</p>`,
  );
  return sendEmail({ to: p.to, subject: `Reminder: your ${p.item} ${p.daysLeft <= 0 ? "has expired" : "expires soon"}`, html });
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  return sendEmail({
    to,
    subject: "Lumiritin — test email ✈️",
    html: shell(`<p style="font-size:16px">Your email notifications are working.</p><p>This is a test message sent from the Lumiritin operator console.</p>`),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
