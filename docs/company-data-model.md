# First company setup — data and permissions

This milestone implements creation and reading of an operating company. An
operating company is Abysta's security tenant; it is not a customer, portfolio,
building, or site visit. The schema deliberately supports several memberships
per user and several role codes per membership.

## Tables shipped in this milestone

| Table | Fields | Important constraints |
| --- | --- | --- |
| `public.operator_tenant` | `id`, `name`, `currency`, `timezone`, `status`, `created_by`, `created_at`, `updated_at`, `row_version` | UUID primary key; name 2–120 Unicode code points; GBP/CHF/EUR/USD; active/archived status; creator references Auth with delete restricted. |
| `public.membership` | `tenant_id`, `id`, `auth_user_id`, `member_type`, `status`, `role_codes`, `created_at`, `updated_at`, `row_version` | Composite primary key `(tenant_id,id)`; one membership per `(tenant_id,auth_user_id)`; internal/client type; active/suspended/revoked status; role array contains 1–16 non-null, non-empty codes; referenced company and Auth user cannot be silently deleted. |
| `abysta_private.company_setup_request` | `auth_user_id`, `request_id`, normalized `name`, `currency`, `timezone`, `tenant_id`, `created_at` | Receipt key `(auth_user_id,request_id)`; inaccessible to anonymous and authenticated clients; never select or export it from the web application. |

Database triggers advance `updated_at` and `row_version` on a privileged update.
They do not provide an edit API or optimistic-concurrency UI. Those are later
milestones. `created_by` has no uniqueness constraint: membership cardinality is
not artificially restricted to one company per person.

## Creation API

```ts
supabase.rpc("create_operator_tenant", {
  p_name: "Northline Facilities",
  p_currency: "GBP",
  p_timezone: "Europe/London",
  p_request_id: "<a UUID retained for this submission and its retries>",
});
// data: UUID string of the created company
```

The function accepts no creator, owner, membership, or tenant ID supplied by the
browser. It reads the authenticated user from `auth.uid()` and requires that
`auth.users.email_confirmed_at` is set. It creates the company, that user's
active internal membership with `role_codes = ['owner']`, and the request receipt
in the same database transaction. A failure in any insert rolls all three back.

The name is trimmed using JavaScript's `String.trim()` whitespace set, including
vertical tab, non-breaking space, Unicode spaces, and BOM. Its normalized length
must be 2–120 Unicode code points; internal ASCII controls (U+0001–001F and U+007F)
are rejected. PostgreSQL itself cannot store U+0000 in text. The currency must be
one of the exact uppercase codes. Time-zone validity is checked against
`pg_catalog.pg_timezone_names`, not against a hardcoded browser list.

### Idempotency and first-workspace scope

An advisory transaction lock serializes onboarding for the same authenticated
actor. Under the application's default PostgreSQL **READ COMMITTED** isolation,
the function checks a matching receipt before considering new creation:

1. Same actor, same request key, same normalized fields: return the existing UUID
   if the company and actor's internal membership are still active.
2. Same actor and key but different fields: reject the conflicting request.
3. Old request after access revocation or company archival: reject the replay.
4. New request key while the actor has any active internal membership in an
   active company: reject creation and let the UI open that workspace.
5. An eligible actor with no active workspace: create company and owner.

This is an **initial onboarding entrypoint**, not the future “add another
company” workflow. A user can already have multiple memberships. The application
must not describe this RPC as a permanent account/company-count restriction.
An actor whose only memberships are revoked, suspended, or archived cannot regain
those workspaces by replaying onboarding; they may create a new independent
workspace through a new eligible request.

The lock code is implemented, but the in-memory test runner uses one database
session. Independent two-connection race testing remains a pre-release check.
Do not claim the single-session suite proves concurrent execution or production
token behaviour.

### Errors consumed by the application

| PostgreSQL code | Message | UI meaning |
| --- | --- | --- |
| `28000` | `AUTH_REQUIRED` | Sign in again. |
| `28000` | `EMAIL_NOT_VERIFIED` | Confirm the account email. |
| `22023` | `INVALID_COMPANY_NAME` | Correct the company name. |
| `22023` | `INVALID_CURRENCY` | Choose a supported currency. |
| `22023` | `INVALID_TIMEZONE` | Choose a valid time zone. |
| `22023` | `INVALID_REQUEST_ID` | Retry with a valid submission identifier. |
| `22023` | `REQUEST_KEY_REUSED` | This submission key belongs to different fields; deliberately start a new submission after reconciliation. |
| `42501` | `COMPANY_ACCESS_REVOKED` | The previous workspace is no longer accessible; do not show cached details. |
| `42501` | `ABYSTA_ALREADY_HAS_WORKSPACE` | Reload current memberships and open the existing workspace. |

Malformed UUID text fails before function execution with `22P02`. Anonymous calls
and forbidden direct table access fail with database permission errors (`42501`).
Other errors should remain generic in the UI and be investigated using server
logs without disclosing credentials.

## Read and write permissions

| Actor | Company metadata | Membership rows | Direct inserts/updates/deletes |
| --- | --- | --- | --- |
| Anonymous | Denied | Denied | Denied |
| Authenticated, no matching membership | No visible rows | No visible rows | Denied |
| Active internal member, active company | Own accessible companies | Own membership only | Denied |
| Active internal Owner/Admin, active company | Own accessible companies | Company roster, including inactive colleagues | Denied |
| Client member, even with an `owner` role code | No internal workspace access | No internal roster access | Denied |
| Suspended/revoked internal membership | No access through that membership | No access through that membership | Denied |
| Member of an archived company | Archived company hidden | Archived company roster hidden | Denied |

RLS checks current database membership on every query. Authorization is not based
on a role copied into stale JWT metadata or on hiding an element in the browser.
The private helpers only evaluate the authenticated caller; they cannot be given
another user's ID. All security-definer functions use an empty fixed search path
and fully qualified objects. Only intended function execution is granted; direct
table writes are unavailable to the application role, including an owner.

`Owner` and `Admin` here authorize the limited metadata/roster reads described
above. **No labour, costing, finance, client publication, export, approval,
invitation, deletion, or scoped `access_grant` capability is implemented.**
Future resource tables must preserve tenant-bound composite relationships and
gain their own capability and record-state checks before storing data.

## Repeatable local verification

From `web/`, after installing the repository's dependencies:

```bash
node --test ../supabase/tests/company-setup.test.mjs
```

The harness starts disposable PGlite PostgreSQL in memory and applies the exact
migration. Its minimal Auth shim supplies users and `auth.uid()`; it does not use
a Supabase project, API key, network connection, or real user data.

The suite has **35 named acceptance cases** (36 test-runner totals including the
parent). It verifies tenant separation, known-ID probing, anon denial, owner and
ordinary-member write denial, self-promotion denial, client-role denial, revoked
and archived access, invited and multi-company memberships, normalization,
idempotency, validation, rollback after a forced owner-insert failure, and
restricted Auth-user deletion. These are database integration checks, not a
replacement for browser, PostgREST, real Auth, restore, or deployment tests.

### Two-session development verification still required

Use only a disposable local Supabase instance or the development project, with a
confirmed test user who has no existing active internal memberships. Do not run
fixture setup or role impersonation in production.

1. Open two independent PostgreSQL sessions against the same development database.
2. In session A, begin a transaction, set the local role to `authenticated`, set
   the local `request.jwt.claim.sub` to the confirmed test user's UUID, and call
   the creation RPC with a fresh request UUID. Leave the transaction uncommitted.
3. In session B, begin and set the same actor/role, then call the same request and
   payload. It should wait for session A's transaction.
4. Commit A. B must return the same company UUID. Commit B and verify exactly one
   company and one owner membership were created for that fixture.
5. Repeat with a fresh confirmed test user but distinct request UUIDs in A and B.
   After A commits, B must fail with `ABYSTA_ALREADY_HAS_WORKSPACE`; roll back B.
6. Repeat with the same request UUID but different names. B must fail with
   `REQUEST_KEY_REUSED`; roll back B.

Also test two separately signed-in users through the real development app and
Supabase API, including a fresh query after a membership is revoked. Preserve
request IDs and evidence in the delivery record; keep test users separate from
real customer data.

## Applying the migration

`supabase/migrations/20261002000100_company_setup.sql` is transaction-wrapped and
intended to run once, in order, with the privileged migration connection. Review
and apply it to the development project using the team's migration process.
If manually applying through Supabase's SQL Editor, run the complete file as one
script and record it in migration history before adopting CLI deployment later.
Never paste migration credentials into Next.js public environment variables or
call this DDL from a browser. This work does not apply any change to a hosted
Supabase database.
