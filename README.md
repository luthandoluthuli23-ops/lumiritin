# Lumiritin

Private aviation for South Africa. One platform for three kinds of user:

| Who | What they get |
|---|---|
| **Passengers** | Custom charter requests with an instant ZAR estimate, and an empty-leg marketplace (repositioning flights sold per seat at up to 75% off). |
| **Operators** | Fleet management, empty-leg publishing, a crew dispatcher with transparent pilot matching, and a "bench" dashboard for lending idle crew to other operators. |
| **Pilots** | A SACAA credential wallet (licence, ratings, medical, logbook) with expiry reminders, availability management, external calendar sync, and one-tap responses to crew requests. |

> **Status: development / pre-launch.** Several things are deliberately placeholders or not yet connected to the real world. See [Known gaps](#known-gaps) before relying on any number, claim or verification result you see in the UI.

## Tech stack

- **Web:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, GSAP
- **Data:** PostgreSQL 16 via Prisma
- **Auth:** signed-cookie sessions (JWT, HS256) with scrypt password hashing; role-based route guards in middleware
- **Verifier:** Python (`requests` + BeautifulSoup) SACAA lookup, run as a CLI by the TypeScript jobs
- **Validation:** Zod on every API route

## Repository layout

```
lumiritin/
├── docker-compose.yml          Postgres 16 for local development
├── .env.example                every environment variable, documented
├── verifier/                   Python: SACAA lookup + parser (pure, no database access)
│   ├── src/lumiritin_verifier/ client (rate limiting, block detection), parser, models, CLI
│   └── tests/                  pytest suite (synthetic fixture, not a real SACAA page)
└── web/                        Next.js app + Prisma (owns the database)
    ├── middleware.ts           route guards: /operator/* /wallet/* /dashboard/*
    ├── prisma/                 schema, migrations, seed
    ├── app/
    │   ├── page.tsx            landing (GSAP hero, tabbed search, live counters)
    │   ├── empty-legs/         marketplace with live filtering and booking drawer
    │   ├── charter/            trip configurator + aircraft classes + instant estimate
    │   ├── auth/               role-aware sign-up and sign-in
    │   ├── dashboard/          passenger area
    │   ├── operator/           dashboard, fleet, empty-leg wizard, crewing, bench
    │   ├── wallet/             pilot credential wallet, availability, calendar sync
    │   ├── crew/respond/       public one-tap accept/decline page for crew pings
    │   └── api/                route handlers (see below)
    ├── components/             UI by area (layout, home, charter, operator, pilot, auth, ui)
    ├── lib/                    pure engines and server helpers (see below)
    └── jobs/                   scheduled scripts (verification, reminders, cascade, calendar)
```

### Core modules (`web/lib/`)

| File | Purpose |
|---|---|
| `geo.ts` | Haversine distance, nearest-airfield ranking (pure) |
| `charter.ts` | Aircraft classes and the indicative price estimate (pure; re-run server-side so the client can't set a price) |
| `availability.ts` | Pilot state machine: `AVAILABLE` / `BOOKED` / `OFF`, auto-expiry (pure) |
| `matching.ts` | Deterministic pilot matching: hard gates plus a score out of 100 with a full breakdown (pure, no model) |
| `cascade.ts` | Dispatch: ping top 3, 10-minute window, cascade to the next candidate, acceptance with row locking |
| `ical.ts`, `safe-fetch.ts`, `calendar-sync.ts` | iCal import with an SSRF guard for user-supplied URLs |
| `bench.ts` | Bench-earning policy (**placeholder numbers**) |
| `session*.ts`, `roles.ts`, `password.ts`, `rate-limit.ts` | Auth building blocks |

### API routes (`web/app/api/`)

`auth/{signup,signin,signout,demo}` · `charter/quote` · `empty-legs` (+ `[id]/bookings`) · `aircraft` · `crew-requests` (+ `[id]/{shortlist,dispatch,status}`) · `crew-pings/[token]` · `operator/roster` (+ `[id]`, `[id]/book`) · `pilot/{availability,calendar-sync,roster}` · `verify`

## Getting started

Prerequisites: Node.js 20+ (developed on 24), PostgreSQL 16 (or Docker), Python 3.10+ for the verifier.

```bash
# 1. environment
cp .env.example .env
cp .env.example web/.env
# then edit BOTH files and set SESSION_SECRET (32+ chars):
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# 2. database (skip if you already run PostgreSQL 16 with a lumiritin user/db)
docker compose up -d

# 3. web app
cd web
npm install
npx prisma migrate dev          # applies all migrations
npm run db:seed                 # airfields (real reference data) + a fictional demo dataset
npm run dev                     # http://localhost:3000

# 4. verifier (optional: only needed for the nightly verification job)
cd ../verifier
python -m venv .venv && .venv/Scripts/activate      # or: source .venv/bin/activate
pip install -e ".[dev]"
pytest
python -m lumiritin_verifier --html tests/fixtures/sample_result.html   # offline parse
```

> On npm 11+, install scripts are blocked by default. If `@prisma/client` is missing after install, run `npx prisma generate` in `web/`.

### Try it

In development the navbar shows a **"Demo as" switcher** (Passenger / Operator / Pilot) that signs you in as a seeded demo user with no password. It is hard-disabled when `NODE_ENV=production`.

- **Operator → Crewing:** choose Cessna Citation Sovereign (C680), FAPM, a date two or more days out. You get a ranked top-3 shortlist with a score breakdown. *Dispatch* sends 10-minute confirm-pings.
- **Pilot → Wallet:** set availability (it always expires), connect a calendar, accept roster invitations.
- **Operator → Bench:** roster, shared-pool toggle, mark-busy control, accrued earnings.
- With no `WHATSAPP_TOKEN`, WhatsApp messages are logged to the console instead of sent. To act on a ping you need its token (in the `crew_ping` table): open `/crew/respond/<token>`.

`npm run db:seed` is idempotent and resets the demo operator's empty legs, crew requests and pilot availability. **Never run it against production**: everything except the airfields is fictional demo data.

## How the key engines work

**Availability.** A pilot's state for a time range is derived from stored windows. `BOOKED` if any booked window overlaps; `AVAILABLE` if an unexpired available window covers the whole range; otherwise `OFF`. "Available until Friday 18:00" is just a window ending then, so expiry needs no cleanup job. Windows can last at most 7 days. Sources: manual, automatic booking lock, operator dispatcher, imported iCal.

**Matching.** Hard gates (a pilot failing any is excluded, with reasons): pool access, availability for the whole job, exact type rating (SACAA-verified, valid through the job), licence valid and verified with no flags, Class 1 medical valid through the job, the pilot's own travel radius, minimum hours. Eligible pilots score out of 100: proximity 60 (under 50 km is full marks), experience 25, verification freshness 15. Same inputs always give the same ranking. Tunables live at the top of `lib/matching.ts`.

**Dispatch cascade.** The top 3 are pinged (WhatsApp if consented, plus in-app). Each ping lasts 10 minutes. First accept wins; the rest are cancelled. A decline or expiry pings the next-ranked pilot. Acceptance re-checks availability under a row lock, books the pilot for the job window, and accrues a bench earning for the lending operator if applicable. Nothing relies on an in-process timer; the cascade advances from status polling, pilot responses, and `npm run job:cascade`.

**Reciprocal pool.** A pilot on another operator's roster is only reachable if that operator offers them to the pool *and* the requesting operator offers at least one of its own pilots. Pilots must accept a roster invitation before an operator can see or control their availability.

## Scheduled jobs

Run from cron, Task Scheduler, or a GitHub Actions schedule, from `web/`:

| Command | Suggested cadence | What it does |
|---|---|---|
| `npm run job:cascade` | every minute | expires overdue pings and pings the next candidate |
| `npm run job:reminders` | daily ~08:00 SAST | 90/30/7-day WhatsApp expiry reminders |
| `npm run job:verify` | nightly ~02:00 SAST | re-checks consented licences against SACAA (needs `SACAA_PORTAL_URL`) |
| `npm run job:calendar` | every 30 minutes | re-imports connected pilot calendars |

## Deploying to Vercel

Deploy **only the `web/` app**. Do not import `verifier/` (Python) and do not use the "Services" preset: the Python verifier cannot run inside the Next.js functions, so it needs a separate runner (see below).

1. **Database.** Vercel does not host PostgreSQL. Create one on a managed provider (Neon, Supabase, Vercel's Marketplace Postgres, etc.) and copy its **pooled** connection string for the app.
2. **Import** the repo in Vercel: choose the `web` project (Next.js), so *Root Directory* is `web`. The build command (`prisma generate && next build`) is already set in `package.json`.
3. **Environment variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL`: the pooled connection string
   - `SESSION_SECRET`: a **new** random 32+ character value (not the one from your local `.env`)
   - `APP_BASE_URL`: your deployed URL, e.g. `https://lumiritin.vercel.app`
   - optional: `NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164`, `WHATSAPP_*`, `SACAA_*`
4. **Create the schema and reference data once**, from your own machine, pointing at the production database (use the provider's *direct*, non-pooled URL for migrations):
   ```bash
   cd web
   DATABASE_URL="<direct url>" npx prisma migrate deploy
   DATABASE_URL="<direct url>" npm run db:seed:airfields
   ```
   **Never run `npm run db:seed` against production.** It loads fictional demo data and deletes data; it refuses to run unless `DATABASE_URL` is local.
5. **Deploy.** The demo role switcher is automatically disabled in production, so users sign up normally.

What does not work on Vercel as-is:

- **`/api/verify` and `npm run job:verify`** spawn the Python verifier, which is not part of the deployment. Run the verification job elsewhere (e.g. a scheduled GitHub Action) once the real SACAA portal is connected.
- **Scheduled jobs.** Vercel Hobby cron runs at most once a day, but the crew-ping cascade needs to run every minute. Until a scheduler calls `npm run job:cascade`, the cascade only advances while an operator has the status page open or a pilot responds.
- **Rate limiting** is in-memory per serverless instance, so it is only a soft limit on Vercel. Move it to a shared store (e.g. Redis) before launch.
- Vercel's free Hobby plan is for personal, non-commercial use.

## Environment variables

See [`.env.example`](.env.example) for the full, commented list. Required to run: `DATABASE_URL` and `SESSION_SECRET`. Everything else (SACAA portal, WhatsApp, concierge number, base URL) is optional locally.

## Security notes

- Sessions are HTTP-only, `SameSite=Lax` cookies, `Secure` in production. Every protected route is checked in middleware **and** again in the page or handler.
- Passwords use scrypt. Sign-in is rate-limited per IP and per account and does not reveal whether an email exists.
- API handlers derive the operator or pilot from the session; request bodies are never trusted for identity.
- The calendar importer fetches user-supplied URLs server-side. It allows only public HTTPS hosts, re-validates every redirect, and caps size and time. DNS rebinding remains a small residual risk (documented in `lib/safe-fetch.ts`).
- Rate limiters are in-memory and per process; replace with a shared store when running more than one instance.
- Crew-ping links are secret tokens that work only while the ping is pending.
- **Do not commit `.env` files.** Only `.env.example` is tracked.

## Known gaps

These are real and affect what you can trust:

- **SACAA verification has not run against the real portal.** The parser is tested on a synthetic fixture. Until it is connected, no pilot is genuinely "verified", and the matching engine (which requires verified ratings) only matches seeded demo pilots. The landing-page counters "100% SACAA-verified crew" and "< 2 hr dispatch" are placeholders, not measurements.
- **Placeholder money.** Charter hourly rates (`lib/charter.ts`) and bench earnings (15% of an assumed R3,500/hr, `lib/bench.ts`) are invented. Earnings are accrued only; there is no payout or payment system.
- **Operators are not verified.** AOC numbers and licence ownership are not validated at sign-up.
- **No admin/approval flow**, no email sending, no password reset.
- **WhatsApp** templates (`credential_expiry_reminder`, `crew_request_ping`) need Meta approval before real messages send.
- **Airfields:** only seven are seeded (FAPM, FALA, FACT, FAOR, FADN, FAKN, FAPE). Add more rows to extend routes and charter quotes.
- **Medical class rule** (Class 1 required) should be confirmed against current SACAA requirements.
- **Tests:** the Python verifier has a pytest suite. The web engines were verified with ad hoc scripts that are not committed yet, so there is no JS test suite in CI.
- Recurring (RRULE) calendar events are not expanded; the UI tells the pilot when any were skipped.
- Charter references (`LUM-2026-X981`) allow about 22,000 per year; the format needs a longer suffix at volume.

## Before going live (checklist)

- [ ] Real SACAA portal URL, a saved real results page, updated parser aliases (`verifier/src/lumiritin_verifier/parser.py`)
- [ ] Confirm the portal's terms permit automated nightly checks; finalise POPIA consent wording (currently versioned `signup-v1`)
- [ ] Replace placeholder rates and bench terms with commercial decisions
- [ ] Operator verification flow; real CAPTCHA/abuse protection on public endpoints
- [ ] Production `SESSION_SECRET`, HTTPS, a managed PostgreSQL, a shared rate-limit store
- [ ] Schedule the four jobs; get WhatsApp templates approved
- [ ] Add a license, a JS test suite and CI

## Licence

No licence has been chosen yet, so by default all rights are reserved even though the repository is public.
