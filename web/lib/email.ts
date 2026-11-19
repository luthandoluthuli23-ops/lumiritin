// Transactional email via Resend (https://resend.com). Gated on RESEND_API_KEY the same way
// WhatsApp is gated on its token: without the key it logs a dry-run instead of sending, so the app
// works in dev and never breaks a request if email is down. Never throws.
import { formatZar } from "@/lib/empty-legs-shared";
import { isCharterEnabled } from "@/lib/features";

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
      signal: AbortSignal.timeout(10_000), // a slow provider must never hang a request
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] failed HTTP ${res.status}: ${body.slice(0, 300)}`);
      let detail = "";
      try {
        const j = JSON.parse(body) as { message?: string; error?: string };
        detail = j.message ?? j.error ?? "";
      } catch {
        detail = body.slice(0, 200);
      }
      return { ok: false, error: detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Minimal branded wrapper ──────────────────────────────────────────────────
const DEFAULT_FOOTER = "Lumiritin — private aviation charter, South Africa. This is a notification, not a booking confirmation; an operator confirms availability and the final price.";
function shell(bodyHtml: string, footer = DEFAULT_FOOTER): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#0b0f17;color:#e9e4d8;padding:32px">
    <div style="max-width:560px;margin:0 auto;background:#121826;border:1px solid #ffffff14;border-radius:16px;padding:28px">
      <p style="font-size:22px;color:#e2b857;margin:0 0 16px;font-weight:600">Lumiritin</p>
      ${bodyHtml}
      <p style="margin-top:24px;font-size:12px;color:#8b97ab">${escapeHtml(footer)}</p>
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

/** Absolute link into the site for emails. APP_BASE_URL in production; Vercel's production host as a fallback; localhost in dev. */
export function siteUrl(path = "/"): string {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = (process.env.APP_BASE_URL ?? (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")).replace(/\/$/, "");
  return base + (path.startsWith("/") ? path : `/${path}`);
}

type WelcomeRole = "PILOT" | "OPERATOR" | "PASSENGER";

const button = (href: string, label: string) =>
  `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#d4af37;color:#0b0f17;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapeHtml(label)}</a></p>`;
const step = (title: string, rest: string) => `<li style="margin-bottom:8px"><b style="color:#e2b857">${escapeHtml(title)}</b> ${escapeHtml(rest)}</li>`;

/** The welcome email for a new account: subject, HTML and a plain-text alternative. Pure, so it can be tested. */
export function buildWelcomeEmail(p: { firstName: string; role: WelcomeRole }): { subject: string; html: string; text: string } {
  const name = p.firstName.trim() || "there";
  let intro: string;
  let steps: [string, string][];
  let cta: { href: string; label: string };
  if (p.role === "PILOT") {
    intro = "Your crew account is ready. Here's how to get flight-ready:";
    steps = [
      ["Get verified.", "Upload a photo of your SACAA licence and medical. A Lumiritin reviewer checks them and we email you the result."],
      ["Bring your logbook.", "Import your existing hours (a CSV, or a photo of a logbook page), then flights you fly through Lumiritin log themselves."],
      ["Stay available.", "Keep your availability up to date so operators can offer you duties, and we'll remind you before anything expires."],
    ];
    cta = { href: siteUrl("/wallet"), label: "Open my credential wallet" };
  } else if (p.role === "OPERATOR") {
    intro = "Your operator account is ready. To get going:";
    steps = [
      ["Add your fleet.", "Register your aircraft so you can publish empty legs."],
      ["Post a crew request.", "Describe a flight and we rank qualified, available crew and ping the best matches."],
      ["Publish an empty leg.", "Turn a repositioning flight into seats passengers can book at a discount."],
    ];
    cta = { href: siteUrl("/operator/dashboard"), label: "Open my dashboard" };
  } else {
    intro = "Your account is ready. You can now:";
    steps = isCharterEnabled()
      ? [
          ["Request a charter.", "Build your trip and get an instant estimate in rand. An operator then confirms a firm price."],
          ["Browse empty legs.", "Repositioning flights sold per seat at up to 75% off."],
          ["Track your requests.", "Everything you book or request appears under My bookings."],
        ]
      : [
          ["Browse empty legs.", "Private repositioning flights sold per seat at up to 75% off the charter rate."],
          ["Filter by route and date.", "Pick where you're flying from and to, and when."],
          ["Track your bookings.", "Everything you book appears under My bookings."],
        ];
    cta = isCharterEnabled() ? { href: siteUrl("/charter"), label: "Plan a trip" } : { href: siteUrl("/empty-legs"), label: "Browse empty legs" };
  }
  const html = shell(
    `<p style="font-size:16px">Welcome aboard, ${escapeHtml(name)}.</p>
     <p>${escapeHtml(intro)}</p>
     <ol style="padding-left:18px;margin:8px 0 0">${steps.map(([t, r]) => step(t, r)).join("")}</ol>
     ${button(cta.href, cta.label)}
     <p style="margin-top:20px;font-size:13px;color:#8b97ab">Questions? Open Lumiritin and ask Lumi, or just reply to this email.</p>`,
    "You're receiving this because you created a Lumiritin account.",
  );
  const text = [`Welcome aboard, ${name}.`, "", intro, ...steps.map(([t, r], i) => `${i + 1}. ${t} ${r}`), "", `${cta.label}: ${cta.href}`, "", "You're receiving this because you created a Lumiritin account."].join("\n");
  return { subject: "Welcome to Lumiritin", html, text };
}

export async function sendWelcomeEmail(p: { to: string; firstName: string; role: WelcomeRole }): Promise<{ ok: boolean; error?: string }> {
  const { subject, html, text } = buildWelcomeEmail(p);
  return sendEmail({ to: p.to, subject, html, text });
}

/** Sent when a pilot's verification state changes (lib/state-notifications.ts). */
export async function sendStateChangeEmail(p: { to: string; name: string; state: string; detail: string }): Promise<{ ok: boolean; error?: string }> {
  const html = shell(
    `<p style="font-size:16px">Hi ${escapeHtml(p.name)},</p>
     <p>Your verification status is now <b style="color:#e2b857">${escapeHtml(p.state)}</b>.</p>
     <p style="font-size:14px;color:#8b97ab">${escapeHtml(p.detail)}</p>
     <p style="margin-top:16px"><a href="${escapeHtml(siteUrl("/wallet/verify"))}" style="color:#e2b857">Open your wallet →</a></p>
     <p style="margin-top:8px;font-size:13px;color:#8b97ab"><a href="${escapeHtml(siteUrl("/verification"))}" style="color:#8b97ab">What the states mean</a></p>`,
    "You're receiving this because you have a Lumiritin pilot account.",
  );
  return sendEmail({ to: p.to, subject: `Your verification status: ${p.state}`, html, text: `Hi ${p.name},\n\nYour verification status is now ${p.state}.\n${p.detail}\n\n${siteUrl("/wallet/verify")}` });
}

/** Sent to the pilot as soon as their licence and medical are uploaded for review. */
export async function sendSubmissionReceivedEmail(p: { to: string; name: string }): Promise<{ ok: boolean; error?: string }> {
  const html = shell(
    `<p style="font-size:16px">Hi ${escapeHtml(p.name)},</p>
     <p>Thanks, we've received your licence and medical. A Lumiritin reviewer will check them against your details and we'll email you as soon as there's a result.</p>
     <p style="font-size:14px;color:#8b97ab">Your documents are stored encrypted and only reviewers can open them.</p>
     <p style="margin-top:16px"><a href="${escapeHtml(siteUrl("/wallet/verify"))}" style="color:#e2b857">See your verification status →</a></p>`,
    "You're receiving this because you asked Lumiritin to verify your documents.",
  );
  const text = `Hi ${p.name},

Thanks, we've received your licence and medical. A Lumiritin reviewer will check them and we'll email you as soon as there's a result.

${siteUrl("/wallet/verify")}`;
  return sendEmail({ to: p.to, subject: "We've received your documents", html, text });
}

/** Tells the reviewers (REVIEWER_EMAILS) that a new submission is waiting. No pilot details in the email itself. */
export async function sendReviewerQueueEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const link = siteUrl("/admin/review");
  const html = shell(
    `<p style="font-size:16px">A pilot has uploaded documents for verification.</p>${button(link, "Open the review queue")}`,
    "You're receiving this because you're a Lumiritin reviewer.",
  );
  return sendEmail({ to, subject: "New verification waiting for review", html, text: `A pilot has uploaded documents for verification.

${link}` });
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
