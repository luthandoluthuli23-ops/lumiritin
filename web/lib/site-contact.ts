// Public contact details shown across the site. Real values come from the environment; until they are set the page
// shows a clearly marked placeholder (e.g. "[PHONE]") instead of an invented number. Never hard-code guesses here.

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** WhatsApp / phone number in E.164, given by the owner on 2026-11-18 (NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164 overrides it). */
const whatsappE164 = env(process.env.NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164) ?? "+27828399906";

/** "+27828399906" → "082 839 9906" (South African numbers in the familiar local form; others as given). */
export function displayPhone(e164: string): string {
  const d = e164.replace(/[^\d]/g, "");
  return /^27\d{9}$/.test(d) ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : e164;
}

/** Public contact email, given by the owner on 2026-11-18. */
const CONTACT_EMAIL = env(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ?? "hello@lumiritin.co.za";

export const SITE_CONTACT = {
  /** What to print for the phone/WhatsApp number. */
  phoneDisplay: displayPhone(whatsappE164),
  /** wa.me link (opens a WhatsApp chat with the number). */
  whatsappUrl: `https://wa.me/${whatsappE164.replace(/[^\d]/g, "")}`,
  /** Public contact email (the owner's address; NEXT_PUBLIC_CONTACT_EMAIL overrides it). */
  email: CONTACT_EMAIL,
  emailUrl: `mailto:${CONTACT_EMAIL}`,
} as const;

/**
 * Who is behind Lumiritin (shown on /about and in the legal pages). Given by the owner on 2026-11-18; anything still in
 * [BRACKETS] is a placeholder: these are facts about real people and a real company, so they must never be guessed.
 */
export const COMPANY = {
  founderName: "Luthando Luthuli",
  founderBackground: "a student pilot",
  companyName: "Lumiritin Aviation",
  companyRegistration: "2026/770269/07",
  cityProvince: "Pietermaritzburg, KwaZulu-Natal",
  /** POPIA Information Officer (name and contact) for privacy requests. */
  informationOfficer: "Luthando Luthuli (hello@lumiritin.co.za, 082 839 9906)",
} as const;

/** "Our story" on /about, in the owner's own words (2026-11-18). One string per paragraph. */
export const OUR_STORY = [
  "Lumiritin began at the aero club in Pietermaritzburg. Luthando Luthuli, a student pilot, kept seeing the same thing there. Pilots sat with their logbooks open, copying hours line by line, adding up totals by hand and hoping nothing had been missed. Every flight meant more paperwork, and one wrong entry could cause trouble at a renewal or a job interview.",
  "So we set out to make it simple. With Lumiritin you snap a picture of your logbook page and your hours update. No retyping, no recounting.",
  "The more time we spent around the club, the more we noticed a second problem: operators struggling to find crew at short notice, and good pilots and cabin crew missing out on work. Now an operator sends out a request, available flight and cabin crew respond, and Lumi ranks the top three for the job.",
  "Made by the aviation community, for the aviation community.",
] as const;

/** Stated on /about and in the footer, word for word. */
export const NOT_AN_OPERATOR = "Lumiritin is a booking and credentialing platform, not an air operator.";

/** The one-line help fallback shown wherever content can't be loaded. */
export const HELP_FALLBACK = `WhatsApp ${SITE_CONTACT.phoneDisplay} for help.`;
