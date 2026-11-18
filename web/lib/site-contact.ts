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
  /** mailto link, or null while the email is a placeholder. */
  emailUrl: env(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ? `mailto:${env(process.env.NEXT_PUBLIC_CONTACT_EMAIL)}` : null,
} as const;

/**
 * Who is behind Lumiritin (shown on /about and in the legal pages). Every value is a placeholder until the owner
 * replaces it: these are facts about real people and a real company, so they must never be guessed.
 */
export const COMPANY = {
  founderName: "[FOUNDER_NAME]",
  founderBackground: "[FOUNDER_BACKGROUND]",
  whyStarted: "[WHY_STARTED]",
  companyName: "[COMPANY_NAME]",
  companyRegistration: "[COMPANY_REGISTRATION_NUMBER]",
  cityProvince: "[CITY_PROVINCE]",
  /** POPIA Information Officer (name and contact) for privacy requests. */
  informationOfficer: "[INFORMATION_OFFICER]",
} as const;

/** Stated on /about and in the footer, word for word. */
export const NOT_AN_OPERATOR = "Lumiritin is a booking and credentialing platform, not an air operator.";

/** The one-line help fallback shown wherever content can't be loaded. */
export const HELP_FALLBACK = `WhatsApp ${SITE_CONTACT.phoneDisplay} for help.`;
