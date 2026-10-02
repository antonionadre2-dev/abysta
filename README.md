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
two new migrations and run the development acceptance scenario. Both migrations
are applied in `abysta-dev`; see the
[verification report](docs/directory-verification-2026-10-02.md) for the hosted
acceptance evidence, cleanup and remaining production gates.
