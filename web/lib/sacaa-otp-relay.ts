// SACAA OTP relay: the pilot enters their licence number, SACAA's personnel-licensing portal sends them an OTP by SMS,
// and they type it into Lumiritin so we can complete the lookup on their behalf.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
// │ DO NOT ENABLE (SACAA_OTP_RELAY must stay false) until a legal review of SACAA's terms of use has been done and  │
// │ confirms that relaying a holder's OTP through a third party is permitted. Relaying one-time PINs may breach the │
// │ portal's terms or be treated as unauthorised access, even with the pilot's consent.                             │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Even when enabled, the portal client below is deliberately not implemented: SACAA's OTP endpoints are undocumented,
// and guessing them would mean scraping a government system blind. Implement startLookup/completeLookup against the
// real endpoints only after the legal review, and only with a captured, consented test session.

export const isOtpRelayEnabled = (): boolean => (process.env.SACAA_OTP_RELAY ?? "false").trim().toLowerCase() === "true";

export class OtpRelayUnavailableError extends Error {
  constructor(reason: "disabled" | "not_implemented") {
    super(reason === "disabled" ? "The SACAA OTP relay is switched off (SACAA_OTP_RELAY=false)." : "The SACAA OTP relay client is not implemented yet.");
  }
}

/** Ask SACAA to send the holder an OTP. Not implemented: see the warning above. */
export async function startLookup(_licenceNumber: string): Promise<{ sessionId: string }> {
  if (!isOtpRelayEnabled()) throw new OtpRelayUnavailableError("disabled");
  throw new OtpRelayUnavailableError("not_implemented");
}

/** Submit the OTP the holder received and fetch their record. Not implemented: see the warning above. */
export async function completeLookup(_sessionId: string, _otp: string): Promise<never> {
  if (!isOtpRelayEnabled()) throw new OtpRelayUnavailableError("disabled");
  throw new OtpRelayUnavailableError("not_implemented");
}
