// Public contact details shown across the site. Real values come from the environment; until they are set the page
// shows a clearly marked placeholder (e.g. "[PHONE]") instead of an invented number. Never hard-code guesses here.

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** WhatsApp / phone number in E.164, e.g. +27821234567 (NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164). */
const whatsappE164 = env(process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164);

export const SITE_CONTACT = {
  /** What to print for the phone/WhatsApp number. */
  phoneDisplay: whatsappE164 ?? "[PHONE]",
  /** wa.me link, or null while the number is a placeholder. */
  whatsappUrl: whatsappE164 ? `https://wa.me/${whatsappE164.replace(/[^\d]/g, "")}` : null,
  /** Public contact email (NEXT_PUBLIC_CONTACT_EMAIL). */
  email: env(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ?? "[CONTACT_EMAIL]",
} as const;

/** The one-line help fallback shown wherever content can't be loaded. */
export const HELP_FALLBACK = `WhatsApp ${SITE_CONTACT.phoneDisplay} for help.`;
