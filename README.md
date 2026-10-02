# abysta
Abysta — Site visits, costing and tender management

## Deployment

The Next.js application lives in `web/`. When importing this repository into Vercel, set **Root Directory** to `web`.

## Company setup

The first workspace milestone adds company onboarding and the owner's membership.
Follow [the Spanish setup guide](docs/company-setup-es.md) to apply the database
migration and verify the app. See [the data and permissions reference](docs/company-data-model.md)
for the schema, acceptance cases, and remaining deployment checks.

## Clients, portfolios and buildings

The second milestone adds an owner-only directory with independent building
records, shared portfolio membership, version checks and private images.
Follow [the Spanish directory guide](docs/directory-setup-es.md) to apply the
two original migrations and run the development acceptance scenario. Both are
applied in `abysta-dev`. The follow-up migration
`20261002003100_http_conflict_codes.sql` is also applied there and maps stale
directory and image writes to HTTP 409; the final dry-run reports no pending
migrations. See the
[verification report](docs/directory-verification-2026-10-02.md) for the hosted
acceptance evidence, cleanup and remaining production gates.

## Site Visits 3A

This milestone adds owner-only online visit drafts, a typed office-cleaning
questionnaire and immutable saved revisions for each building. Its single
migration is applied in `abysta-dev`; see the
[Spanish setup guide](docs/site-visits-3a-setup-es.md) and
[verification report](docs/site-visits-3a-verification-2026-10-02.md) for hosted
acceptance, cleanup and remaining production gates.

## Local authentication redirects

The current development server uses `http://localhost:3001`. Hosted Supabase now
uses that Site URL and its redirect allowlist retains `http://localhost:3000/**`
and includes `http://localhost:3001/**`; changing `supabase/config.toml` alone
would configure only a local Supabase stack. Password recovery returns to
`/auth/callback?next=/auth/update-password`, where the server exchanges the PKCE
code before opening the authenticated password form. Keep the Reset password
email template on `{{ .ConfirmationURL }}` for this flow. The remaining
end-to-end check requires a fresh recovery email and is temporarily blocked by
the hosted email rate limit.
