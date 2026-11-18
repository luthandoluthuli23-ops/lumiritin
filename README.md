**Status: pre-launch. Verification results are for testing and must not be relied on for operational decisions.**

# Lumiritin

The free wallet for South African pilots: licence, medical and logbook in one place, with WhatsApp warnings before
anything expires. Pilots are the first customers.

| Who | What they get |
|---|---|
| **Pilots** (the focus) | A credential wallet (licence, ratings, medical) checked against SACAA records by a reviewer, 60/30/7-day expiry reminders, a logbook (manual entry, CSV import with preview, paper-logbook scanning with row-by-row correction, MyFlightbook connection, full CSV export), availability, calendar sync and one-tap responses to crew requests. Free. |
| **Operators** | Fleet, crew dispatcher with transparent matching (only verified crew are returned), bench. In the code, not promoted on the homepage. |
| **Passengers** | Custom charter (behind `CHARTER_PUBLIC`, off by default) and empty legs. In the code, not promoted on the homepage. |

Lumiritin is a booking and credentialing platform, not an air operator. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) before
relying on anything you see in the UI, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Tech stack

- **Web:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, GSAP
- **Data:** PostgreSQL 16 via Prisma (hosted on Supabase; migrations are idempotent SQL applied by hand)
- **Auth:** signed-cookie sessions (JWT, HS256) with scrypt password hashing; role-based route guards in middleware
- **Verifier:** Python (`requests` + BeautifulSoup) SACAA lookup, run as a CLI by the TypeScript jobs
- **Validation:** Zod on every API route

## Repository layout

```
lumiritin/
├── docker-compose.yml          Postgres 16 for local development
├── .env.example                every environment variable, documented
├── KNOWN_ISSUES.md             what isn't finished or can't be trusted yet
├── SECURITY.md                 how to report a vulnerability
├── THIRD_PARTY_NOTICES.md      MyFlightbook and other third parties
├── verifier/                   Python: SACAA lookup + parser (pure, no database access)
│   ├── src/lumiritin_verifier/ client (rate limiting, block detection), parser, models, CLI
│   └── tests/                  pytest suite (synthetic fixture, not a real SACAA page)
└── web/                        Next.js app + Prisma (owns the database)
    ├── middleware.ts           route guards: /operator/* /wallet/* /dashboard/*
    ├── prisma/                 schema, migrations, seed
    ├── app/
    │   ├── page.tsx            pilot-first homepage
    │   ├── verification/       how verification works (states, what's compared)
    │   ├── verify/[code]/      public check page: name, licence type, state, last verified date only
    │   ├── about/ privacy/ terms/  company details and legal drafts (placeholders)
    │   ├── wallet/             credential wallet, verify, settings (consent), logbook, insights
    │   ├── admin/review/       verification review queue (REVIEWER_EMAILS only)
    │   ├── charter/            charter configurator (CHARTER_PUBLIC)
    │   ├── empty-legs/ dashboard/ operator/ crew/respond/   passenger, operator and crew-ping pages
    │   └── api/                route handlers (see below)
    ├── components/             UI by area (layout, home, pilot, admin, charter, operator, auth, ui)
    ├── lib/                    pure engines and server helpers (see below)
    ├── jobs/                   scheduled scripts (verification, reminders, retention, cascade, calendar)
    └── tests/                  node:test suites + fixtures
```

### Core modules (`web/lib/`)

| File | Purpose |
|---|---|
| `verification-state.ts` | The five profile states, never-a-pass rules, field comparison, badge text (pure) |
| `verification-checks.ts` | Records checks in the append-only audit log and reads a profile's state |
| `pilot-verification.ts` | Consent + document submission, reviewer decisions, consent withdrawal, 90-day document purge |
| `documents.ts` | AES-256-GCM encryption of uploaded documents (`DOCUMENT_ENCRYPTION_KEY`) |
| `sacaa-otp-relay.ts` | OTP-relay path behind `SACAA_OTP_RELAY=false` (not implemented; needs a legal review first) |
| `reminders.ts`, `state-notifications.ts`, `messaging.ts`, `whatsapp.ts` | 60/30/7-day reminders, state-change messages, WhatsApp provider interface |
| `logbook-csv.ts`, `logbook-import.ts`, `logbook-export.ts` | Logbook CSV parsing (pure), what an import saves, full export |
| `matching.ts`, `cascade.ts` | Deterministic crew matching (only VERIFIED/EXPIRING profiles) and the dispatch cascade |
| `availability.ts`, `geo.ts`, `charter.ts`, `bench.ts` | Availability state, distances, charter estimate, bench policy (**placeholder numbers**) |
| `ical.ts`, `safe-fetch.ts`, `calendar-sync.ts` | iCal import with an SSRF guard for user-supplied URLs |
| `features.ts`, `site-contact.ts` | Feature switches (`CHARTER_PUBLIC`) and public contact details / placeholders |
| `session*.ts`, `roles.ts`, `reviewers.ts`, `password.ts`, `rate-limit.ts` | Auth building blocks |

### API routes (`web/app/api/`)

`auth/{signup,signin,signout,demo}` · `pilot/verification` (+ `otp`) · `pilot/consent` · `admin/review/[id]` · `admin/documents/[id]` · `logbook/{entries,import,scan,export,opening-balance}` · `logbook/connect/[provider]` (+ `callback`, `sync`) · `charter/quote` · `empty-legs` · `aircraft` · `crew-requests` · `crew-pings/[token]` · `operator/*` · `pilot/{availability,calendar-sync,roster,...}` · `lumi/try` · `assistant` · `cron/{expiry-reminders,document-retention}` · `health`

## Getting started

Prerequisites: Node.js 20+ (developed on 24), PostgreSQL 16 (or Docker), Python 3.10+ for the verifier.

```bash
# 1. environment
cp .env.example .env
cp .env.example web/.env
# then edit BOTH files and set SESSION_SECRET (32+ chars) and DOCUMENT_ENCRYPTION_KEY (32 bytes, base64):
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. database (skip if you already run PostgreSQL 16 with a lumiritin user/db)
docker compose up -d

# 3. web app
cd web
npm install
npx prisma migrate dev          # LOCAL ONLY: applies all migrations to your local database
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

- **Pilot → Get verified:** consent, enter licence details, upload a licence and medical photo. Add your account's email to `REVIEWER_EMAILS` and open `/admin/review` from a *different* account to decide it (nobody can review their own).
- **Pilot → Logbook:** import a CSV (preview first), scan paper logbook pages and correct each row, or export everything as CSV.
- **Operator → Crewing:** only VERIFIED/EXPIRING crew are returned, so verify a demo pilot first.
- With no `WHATSAPP_TOKEN`, WhatsApp messages are logged to the console instead of sent.

`npm run db:seed` is idempotent and resets demo data. **Never run it against production**: everything except the airfields is fictional demo data.

## How the key engines work

**Verification.** Every pilot profile is in exactly one state: `VERIFIED`, `EXPIRING` (a credential within 60 days of expiry), `CHECK_OVERDUE` (last pass older than 30 days, the latest check failed, or something already expired), `MISMATCH` or `UNVERIFIED`. SACAA's licensing portal sends an OTP to the holder, so checks are pilot-triggered: the pilot consents (text, version and time stored), enters their details and uploads their licence and medical (encrypted at rest). A reviewer compares them field by field; "Verified" only counts when every field matched. Every check is appended to `verification_check`, which a database trigger makes append-only. A failed, timed-out or blocked lookup is recorded as FAILED and can never move a profile towards verified. Changing a name or licence number resets the profile to UNVERIFIED (database triggers). Lumi (AI) may pre-fill the reviewer's view but never decides. Document images are deleted 90 days after a decision; results and the audit log are kept.

**Logbook import.** CSV imports are parsed (any common encoding, delimiter, date and duration format), previewed with exact totals and a reason for every skipped row, then confirmed. Hours are stored exactly (to 0.0001 h) and never rounded or clamped. Paper logbooks are scanned page by page; the pilot checks every row against the photo and corrects anything Lumi misread before saving. The whole logbook can be exported as CSV at any time.

**Matching.** Gate 0: only `VERIFIED` and `EXPIRING` profiles are ever returned. Then hard gates (with reasons): pool access, availability for the whole job, type rating valid through the job, licence and Class 1 medical valid through the job, travel radius, minimum hours. Eligible pilots score out of 100: proximity 60, experience 25, verification freshness 15. Same inputs always give the same ranking.

**Dispatch cascade.** The top 3 are pinged (WhatsApp if consented, plus in-app) for 10 minutes each. First accept wins; a decline or expiry pings the next-ranked pilot. Acceptance re-checks availability under a row lock.

**Reminders.** 60, 30 and 7 days before any licence, rating or medical expires, plus a message on every verification state change. Each message is claimed in the database before it is sent, so overlapping runs never send twice.

**Site assistant ("Ask Lumi").** A floating chat on every page answers aviation questions and helps people use the site (`lib/assistant.ts`, `components/assistant/AssistantWidget.tsx`). It can only read and navigate to an allowlist of pages; it never books, pays or submits anything.

**Logbook connection (MyFlightbook).** OAuth2 connection that pulls a pilot's flights, matched on MyFlightbook's `FlightID` so a re-sync updates rather than duplicates. Tokens are AES-256-GCM encrypted. No MyFlightbook code is included (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## Tests

```bash
cd web && npm test                 # node:test via tsx: unit tests + logbook fixtures
cd verifier && pytest              # the Python parser
```

Database-level tests (append-only audit log, identity resets, the verification flow, reminder idempotency) run only
when `TEST_DATABASE_URL` points at a **local throwaway** database with the migrations applied; otherwise they are
skipped. There is no CI yet.

## Scheduled jobs

Run from cron, Task Scheduler, or a GitHub Actions schedule, from `web/` (on Vercel, the two cron routes in `vercel.json`):

| Command | Suggested cadence | What it does |
|---|---|---|
| `npm run job:reminders` | daily ~08:00 SAST | 60/30/7-day expiry reminders + verification state-change messages |
| `npm run job:retention` | daily | deletes verification document images 90 days after a decision |
| `npm run job:cascade` | every minute | expires overdue crew pings and pings the next candidate |
| `npm run job:verify` | nightly | re-checks consented licences against SACAA (needs a working portal; see KNOWN_ISSUES) |
| `npm run job:calendar` | every 30 minutes | re-imports connected pilot calendars |

## Deploying to Vercel

Deploy **only the `web/` app** (Root Directory `web`).

1. **Database.** Use the provider's pooled connection string for `DATABASE_URL`.
2. **Apply migrations by hand, before deploying code that needs them.** They are idempotent SQL in `web/prisma/migrations/`; paste them, in folder order, into the Supabase SQL editor (or `prisma db execute --file`). Never run `prisma migrate dev` against the hosted database.
3. **Environment variables:** `DATABASE_URL`, `SESSION_SECRET`, `APP_BASE_URL`, `DOCUMENT_ENCRYPTION_KEY`, `REVIEWER_EMAILS`, `CRON_SECRET`, and as needed `ANTHROPIC_API_KEY`, `RESEND_API_KEY`/`EMAIL_FROM`, `WHATSAPP_*`, `MYFLIGHTBOOK_*`, `NEXT_PUBLIC_WHATSAPP_CONCIERGE_E164`, `NEXT_PUBLIC_CONTACT_EMAIL`. Keep `CHARTER_PUBLIC=false` and `SACAA_OTP_RELAY=false`. See `.env.example`.
4. **Never run `npm run db:seed` against production.** It loads fictional demo data and deletes data.

## Environment variables

See [`.env.example`](.env.example) for the full, commented list. Required to run: `DATABASE_URL` and `SESSION_SECRET`; `DOCUMENT_ENCRYPTION_KEY` for document uploads.

## Security notes

- Sessions are HTTP-only, `SameSite=Lax` cookies, `Secure` in production. Every protected route is checked in middleware **and** again in the page or handler.
- Uploaded licence/medical images are AES-256-GCM encrypted with a dedicated key, only reviewers can open them, and they are deleted 90 days after a decision.
- The verification audit log is append-only at the database level.
- Passwords use scrypt. Sign-in is rate-limited and does not reveal whether an email exists. Rate limiters are in-memory per instance.
- **Do not commit `.env` files.** Only `.env.example` is tracked. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Licence

No licence has been chosen yet, so by default all rights are reserved even though the repository is public.
