// WhatsApp message helpers, all sent through the provider interface in lib/messaging.ts (Meta Cloud API when
// configured, a console logger otherwise). None of these throw: a WhatsApp failure must never break the caller.
import { TEMPLATES, whatsappProvider, type WhatsAppProvider } from "./messaging";

export { isWhatsappConfigured } from "./messaging";

/**
 * Sends a connectivity test using a template (default Meta's pre-approved "hello_world"), so an
 * operator can confirm their WhatsApp Cloud API credentials work before their own templates are
 * approved. The recipient must be a verified test number while the sender is on a Meta test number.
 */
export async function sendTestWhatsapp(toE164: string, provider: WhatsAppProvider = whatsappProvider()): Promise<{ ok: boolean; error?: string }> {
  if (provider.name === "console") return { ok: false, error: "not_configured" };
  const r = await provider.sendTemplate({
    toE164,
    template: process.env.WHATSAPP_TEST_TEMPLATE ?? "hello_world",
    params: [],
    language: process.env.WHATSAPP_TEST_TEMPLATE_LANG ?? "en_US",
  });
  return { ok: r.delivered, error: r.error };
}

export interface CrewPingMessage {
  toE164: string;
  name: string;
  route: string; // "FAPM · C680"
  window: string; // "Sat 12 Oct, 08:00 – 14:00"
  link: string; // one-tap accept page
  minutes: number; // how long the pilot has to respond
}

/** Crew confirm-ping. Returns true only if WhatsApp accepted the message. */
export async function sendCrewPing(msg: CrewPingMessage, provider: WhatsAppProvider = whatsappProvider()): Promise<boolean> {
  const r = await provider.sendTemplate({ toE164: msg.toE164, template: TEMPLATES.crewPing(), params: [msg.name, msg.route, msg.window, msg.link, String(msg.minutes)] });
  return r.delivered;
}

export interface ExpiryReminder {
  toE164: string;
  name: string;
  item: string; // "Instrument Rating", "Class 1 medical", "ATPL(A) licence"
  expiresOn: string; // ISO date
  daysLeft: number;
}

/** Expiry reminder. Returns true only if WhatsApp accepted it, so dry runs are never recorded as sent. */
export async function sendExpiryReminder(msg: ExpiryReminder, provider: WhatsAppProvider = whatsappProvider()): Promise<boolean> {
  const r = await provider.sendTemplate({ toE164: msg.toE164, template: TEMPLATES.expiry(), params: [msg.name, msg.item, msg.expiresOn, String(msg.daysLeft)] });
  return r.delivered;
}

export interface StateChangeMessage {
  toE164: string;
  name: string;
  state: string; // "Verified", "Expiring", …
  detail: string; // e.g. "Verified against SACAA records on 10 Nov 2026"
}

/** Verification state change. Returns true only if WhatsApp accepted it. */
export async function sendStateChange(msg: StateChangeMessage, provider: WhatsAppProvider = whatsappProvider()): Promise<boolean> {
  const r = await provider.sendTemplate({ toE164: msg.toE164, template: TEMPLATES.stateChange(), params: [msg.name, msg.state, msg.detail] });
  return r.delivered;
}
