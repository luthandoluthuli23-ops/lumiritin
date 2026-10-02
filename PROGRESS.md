# Lumiritin: progress as of 2026-10-02

## Done
- **Foundation:** Python verifier (`verifier/`, 12/12 tests against a *synthetic* fixture) + Next.js/Prisma web app (`web/`), PostgreSQL 16, 4 migrations.
- **Design system:** Tailwind v4 tokens (obsidian / champagne gold / slate / emerald), Framer Motion variants and GSAP hero timeline in `web/lib/animations.ts`.
- **Public site:** landing page (GSAP radar + flight path, tabbed search, live counters), empty-leg marketplace with booking drawer, custom charter configurator with instant ZAR estimate.
- **Auth:** role-aware sign-up (passenger / operator / pilot), sign-in, middleware route guards, dev-only demo role switcher.
- **Geo:** Haversine + "Detect my location" nearest-airfield picker with manual fallback.
- **Operator portal:** dashboard, fleet, empty-leg wizard, crew dispatcher, bench.
- **Pilot:** wallet scoped to the signed-in pilot, availability (auto-expiring), iCal calendar sync, roster invitations, one-tap crew ping responses.
- **Engines:** availability state machine, deterministic matching, 10-minute ping cascade, reciprocal pool, bench earnings.
- **Verification (ad hoc scripts, not committed):** engines unit-tested; cascade tested against the real DB with an injected clock and an acceptance race; ~270 HTTP and browser checks passing.

## Environment
Node.js 24, PostgreSQL 16 (service `postgresql-x64-16`, port 5432), Python 3.12 with a verifier venv at `verifier/.venv`.

## Next steps
1. **SACAA:** get the real portal URL and a saved real results page; update `FIELD_ALIASES` in `verifier/src/lumiritin_verifier/parser.py`; replace the synthetic fixture. Until then no pilot is genuinely verified.
2. **WhatsApp:** set `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`; get templates `credential_expiry_reminder` and `crew_request_ping` approved.
3. **Commercial placeholders:** replace charter hourly rates (`web/lib/charter.ts`) and bench terms (`web/lib/bench.ts`); remove or replace the landing-page "100% verified" and "< 2 hr" claims.
4. **Trust:** operator (AOC) verification and licence-ownership checks at sign-up; confirm the Class 1 medical rule; confirm the portal's terms allow nightly checks; finalise POPIA wording.
5. **Ops:** schedule `job:cascade` (every minute), `job:reminders`, `job:verify`, `job:calendar`; shared rate-limit store; hosting and a production `SESSION_SECRET`.
6. **Quality:** commit a JS test suite and CI; add a licence; more airfields.

## Restoring from a clone
`node_modules`, `.next`, `.venv` and `.env` are not in the repo. After cloning: copy `.env.example` to `.env` and `web/.env` (set `SESSION_SECRET`), `npm install` + `npx prisma migrate dev` + `npm run db:seed` in `web/`, and `pip install -e ".[dev]"` in `verifier/`. See the README.
