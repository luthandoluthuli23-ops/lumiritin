# Security policy

Lumiritin holds pilots' identity documents and credentials, so we take reports seriously.

## Reporting a vulnerability

Email **[SECURITY_EMAIL]** with:

- what you found and where (URL, endpoint or file),
- steps to reproduce,
- the impact you think it has.

Please do **not** open a public GitHub issue for a vulnerability, and do not access, change or delete other people's
data while testing. Use your own test account.

We aim to acknowledge reports within [RESPONSE_DAYS] working days.

## Scope

In scope: the website and API at lumiritin.co.za and this repository.
Out of scope: third-party services we use (Vercel, Supabase, Anthropic, Resend, Meta WhatsApp, MyFlightbook). Report
those to the provider.

## Handling secrets

Secrets live only in environment variables (see `.env.example`). Never commit `.env` files. If a secret is exposed
(in a commit, a chat, a screenshot), rotate it at the provider straight away.
