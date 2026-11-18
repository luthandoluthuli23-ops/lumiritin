// The consent a pilot gives before uploading documents for verification. The exact text and version are stored with
// every grant (consent.text / consent.textVersion). Change the wording → bump the version.
// NOTE: plain-language description of what the product does; have it reviewed for POPIA before launch.

export const VERIFICATION_CONSENT_SCOPE = "sacaa_verification";
export const VERIFICATION_CONSENT_VERSION = "verification-v1";

export const VERIFICATION_CONSENT_TEXT =
  "I agree that Lumiritin may store the licence and medical details I enter and photos of my SACAA licence and medical " +
  "certificate, so that a Lumiritin reviewer can check my profile against them. The photos are encrypted, only reviewers " +
  "can see them, and they are deleted 90 days after a decision; the result and an audit log of every check are kept. " +
  "Operators will see my verification state and the date it was last verified. I can withdraw this consent at any time " +
  "in my wallet settings, which makes my profile unverified.";

/** Sign-up wording (replaces the old "nightly re-checks" promise, which the OTP-gated SACAA portal makes impossible). */
export const SIGNUP_CONSENT_VERSION = "signup-v2";
export const SIGNUP_CONSENT_TEXT =
  "I consent to Lumiritin checking my licence, ratings and medical against SACAA records, with my documents and my " +
  "consent each time, to keep my wallet current (POPIA).";

/** Sign-up WhatsApp consent (stored with SIGNUP_CONSENT_VERSION). */
export const WHATSAPP_CONSENT_TEXT = "I consent to WhatsApp messages about expiring credentials and changes to my verification status.";
