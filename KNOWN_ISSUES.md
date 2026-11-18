# Known issues

Moved out of the README. These are real and affect what you can trust. Each could become a GitHub issue.

## Verification

1. **No live SACAA lookup.** SACAA's personnel licensing portal sends an OTP to the licence holder, so the nightly job
   and the server-side lookup can't run unattended. Verification is reviewer-based (pilot uploads documents). The
   Python parser is tested only on a synthetic fixture.
2. **"Checked against SACAA records" means the pilot's SACAA-issued documents, compared by a person.** It is not a
   query of SACAA's database. `/verification` says so; keep the wording that way.
3. **OTP relay is a skeleton.** `SACAA_OTP_RELAY` must stay `false` until a legal review of SACAA's terms of use. The
   portal client is deliberately not implemented.
4. **Crew search returns nobody until reviews happen.** Only `VERIFIED`/`EXPIRING` profiles are searchable, and a
   profile becomes `CHECK_OVERDUE` 30 days after its last pass, so pilots must re-submit at least monthly to stay
   searchable. Decide whether 30 days is right for reviewer workload.
5. **An already-expired credential makes a profile `CHECK_OVERDUE`** (the spec doesn't define this case).
6. **Reviewer access is an email allowlist** (`REVIEWER_EMAILS`). No reviewer audit UI beyond the queue's "recently
   decided" list and the `verification_check` table.
7. **Deleting a person leaves their audit rows** (no foreign key, by design: the log is append-only). Decide the POPIA
   retention period for the audit log and how deletion requests are handled.
8. **Consent wording** (`verification-v1`, `signup-v2`) is plain-language and needs a POPIA review.

## Logbook

9. **CSV column names for LogTen and Garmin** are best guesses; check them against real exports.
10. **Scanned rows are saved as "Added by you"** (source `MANUAL`), so "Replace my previous CSV import" never removes
    them. There is no per-row link back to the photo after saving (photos are not stored).
11. **Lumi reads paper logbooks with the `LUMI_MODEL` model** (default a large model), which costs more per page than the
    chat assistant.
12. **MyFlightbook live check:** token response fields, the `Date` format and the meaning of `Landings` /
    `FullStopLandings` / `NightLandings` are unconfirmed. Confirm on the first real flight (`MYFLIGHTBOOK_DEBUG=1`).
    MyFlightbook asks developers not to test against the live site; ask for a staging server.

## Messaging

13. **WhatsApp templates need Meta approval** before real messages send: `credential_expiry_reminder`,
    `verification_state_change`, `crew_request_ping`.
14. **Email** only reaches real users once a domain is verified in Resend and `EMAIL_FROM` uses it.

## Platform

15. **Placeholder money.** Charter hourly rates (`lib/charter.ts`) and bench earnings (`lib/bench.ts`) are invented.
16. **Operators are not verified.** AOC numbers are not validated at sign-up.
17. **No password reset**, no CI, rate limiters are in-memory per instance.
18. **Airfields:** only a handful are seeded. Charter "served" airfields (`CHARTER_SERVED_AIRFIELDS`) are not decided.
19. **Placeholders** on `/about`, `/privacy`, `/terms` and in the footer must be filled before launch.
20. Recurring (RRULE) calendar events are not expanded. Charter references allow about 22,000 per year.
21. **Demo data in the hosted database** was created by the old seed, with realistic-looking names. The seed now uses
    obvious demo names, but existing rows were not changed.
