# Abysta phase 2 — Directory data contract

This milestone creates an owner-only directory of customers, independent buildings and portfolios. It builds on company setup migration `20261002000100_company_setup.sql`; apply `20261002002000_directory.sql` next. Image storage and image pointer columns belong to the following image migration. Follow-up migration `20261002003100_http_conflict_codes.sql` changes only the stale-write SQLSTATE in the directory and image RPCs to `PT409`/HTTP 409; it does not change their payloads, grants or data model.

The operator tenant is the business using Abysta. A client company is its customer. A portfolio groups buildings belonging to one customer. A building may belong to several portfolios; grouping does not copy the building, its contacts or its later visit history. There is no product limit of 10 or 15 buildings. This save API accepts up to 5,000 selected building IDs in one portfolio request as an operational input bound.

## Stored entities

Every business table has composite primary key `(tenant_id, id)`, an authenticated-actor-derived `created_by`, timestamps and `row_version`. IDs are UUIDs. `row_version` starts at 1 and advances on update with the existing metadata trigger. No hard-delete API or direct authenticated writes are granted.

| Table | Relationships and contents | Uniqueness |
| --- | --- | --- |
| `client_company` | Operating tenant → customer; legal name, reference, address, notes, active/archived | Nonempty reference, case-insensitive per tenant |
| `site` | Customer → independent building; name, reference, address, time zone, building type, notes, active/archived | Nonempty reference, case-insensitive per customer |
| `portfolio` | Customer → building grouping; name, reference, notes, active/archived | Nonempty reference, case-insensitive per customer; separate namespace from building references |
| `client_contact` | Customer contact when `site_id` is null; visit contact when a building is specified | At most one primary customer contact and one visit contact per building |
| `portfolio_site` | Same-customer portfolio ↔ building link, `joined_at`, nullable `left_at` | One current link for each portfolio/building pair; previous closed links remain |

Building and portfolio foreign keys include the tenant. Link and site-contact foreign keys include `(tenant_id, client_company_id, id)`, preventing either another company's or another customer's building from being attached. A building or portfolio cannot change customer through the save API.

Contacts store `name`, `email`, `phone` and `job_title`. The application maps these to `contact_name`, `contact_email`, `contact_phone` and `contact_role`. A blank contact is optional; a name is required if another contact field is present. Once created, clearing a contact blanks its fields while retaining its row and history metadata. Saving the parent and its contact is a single transaction. This release stores current contact values, not a full audit trail of earlier text values.

## Permission boundary

`abysta_private.is_directory_owner(tenant_id)` requires all of:

- A current `auth.uid()`.
- Active internal membership in the tenant.
- `owner` among that membership's role codes.
- An active operating company.

Only that authority can select the five directory tables or use the directory save RPC. Anonymous users have neither access. Active `admin`, `sales` and other internal roles do not inherit directory authority; future scoped grants require a separate implementation. A client membership with an `owner` role string is still denied. Suspension, revocation, owner-role removal or company archive takes effect on subsequent reads and writes. Authorization also occurs before every successful request replay.

RLS is enabled on every directory table. Authenticated users receive SELECT only; all writes go through the checked RPC. The RPC and helper use fixed empty `search_path` with schema-qualified references. No browser service-role credential is required or permitted.

## Save API

```sql
public.save_directory_record(
  p_kind text,
  p_tenant_id uuid,
  p_id uuid,
  p_expected_version bigint,
  p_request_id uuid,
  p_data jsonb
) returns uuid
```

`p_kind` is `client`, `site` or `portfolio`. The form supplies a stable new `p_id`; `p_expected_version = 0` creates a record. Updates send the last-read positive version. Existing IDs cannot be overwritten as creates. A stale edit or stale archive is rejected rather than overwriting a newer save. `created_by` is always derived from the current authenticated actor.

`p_data` is a complete object with the following keys. Every ordinary value is a string; optional values are `''`. `site_ids` is an array of distinct UUID strings. Unknown keys, omitted keys, nulls or wrong JSON types are rejected.

| Kind | Required object keys |
| --- | --- |
| `client` | `legal_name`, `reference`, `address`, `notes`, `status`, `contact_name`, `contact_email`, `contact_phone`, `contact_role` |
| `site` | `client_company_id`, `name`, `reference`, `address`, `timezone`, `building_type`, `notes`, `status`, `contact_name`, `contact_email`, `contact_phone`, `contact_role` |
| `portfolio` | `client_company_id`, `name`, `reference`, `notes`, `status`, `site_ids` |

Names require 2–160 Unicode code points. References allow 0–40, notes 0–4,000 and addresses 0–1,000; a building address needs at least 5. Contact maxima are 160 name, 254 email, 60 phone and 100 role. A provided email must match the basic non-whitespace local@domain.suffix format; this does not prove deliverability. Status is `active` or `archived`. Building types are `office`, `retail`, `industrial`, `residential`, `education`, `healthcare`, `hospitality`, `mixed_use`, `other`. Time zones must match PostgreSQL's time-zone catalogue, with the UI using IANA identifiers.

Strings are trimmed with the JavaScript `String.trim()` whitespace set. Internal ASCII control characters are rejected except tab and line endings in addresses/notes. UUID strings are canonicalized and portfolio selections are sorted before saving the request receipt, so selection order does not make a retry a new operation.

## Transactions, retries and simultaneous changes

The private receipt table `abysta_private.directory_request` is keyed by authenticated actor and request UUID. No authenticated caller can read or change receipts directly. A repeated request with the same normalized input returns its original record ID, without reapplying earlier values or incrementing versions. A changed kind, tenant, record ID, expected version or payload with that key returns `REQUEST_KEY_REUSED`. An unsuccessful transaction leaves no receipt, so the same input can be retried after the problem is corrected.

A successful historical replay remains a replay after later edits or a customer archive; it returns the ID without changing anything. It does not bypass current owner or active-operating-company checks. New child mutations against an archived customer are blocked.

The RPC holds shared locks on the active operating company and current owner membership; concurrent company archive or authority changes must serialize with the operation. It then acquires an actor/request advisory lock. Child saves acquire an update lock on their customer, followed by the building or portfolio row; customer edits lock that customer's row. Portfolio changes and building archive therefore serialize through the same parent customer. Row versions are checked after row locking. The entire parent, contact, membership changes and receipt commit or roll back together.

The local tests exercise transaction rollback and sequential conflict/retry outcomes. They do **not** prove behavior with independent simultaneous hosted connections. The release gates below are required before relying on concurrency in production.

## Portfolio membership and archive behavior

Saving a portfolio replaces its complete current selection. Unselected current links receive `left_at`; newly selected buildings receive new link rows. Re-adding a previously removed building never revives the old row. An empty portfolio is valid.

Every selection must refer to a building under the same tenant and customer. An archived building can remain in a portfolio that already contains it, preserving existing relationships. It cannot be added to a different portfolio or re-added after removal until restored. Archiving a building or portfolio does not delete its contacts or links. Owners can restore either with a current row version when its customer is active.

Archiving a customer retains readable customer, building, portfolio and contact records for the owner, but blocks new building or portfolio creates, edits and restorations until the customer is restored. Archiving the operating company removes directory access entirely. This release preserves entities and link history but does not implement a universal audit log, retention purge, tender snapshot or approval workflow.

## Error contract

Raw database details must not be shown to end users. The application maps the stable messages below to helpful English feedback.

| Message | Meaning |
| --- | --- |
| `AUTH_REQUIRED` | No authenticated user |
| `FORBIDDEN` | No current active internal owner authority or company inactive |
| `INVALID_INPUT` | Invalid kind, identifiers, version, object shape, field type or value |
| `RECORD_NOT_FOUND` | Record or specified customer does not exist in this tenant |
| `STALE_RECORD` | Submitted version is outdated or a create ID already exists; `PT409` maps this permanent optimistic conflict to HTTP 409 after migration `03100` |
| `PARENT_ARCHIVED` | Customer must be restored before a new child mutation |
| `IMMUTABLE_CLIENT` | Existing building or portfolio cannot move to another customer |
| `DUPLICATE_REFERENCE` | Nonempty reference already exists in its case-insensitive scope |
| `REQUEST_KEY_REUSED` | A successful save key was reused for different input |
| `INVALID_SITE_SELECTION` | Malformed, duplicated, oversized, missing, wrong-customer or newly archived building selection |

## Local evidence and hosted release gates

Run from `web`:

```sh
node --test ../supabase/tests/directory.test.mjs
```

The test loads the company, directory, image and `03100` conflict-code migrations into disposable PGlite PostgreSQL with a minimal Auth schema. **42 named acceptance cases pass** (Node reports 43 including the parent test). It also asserts that the directory RPC contains three `PT409` conflicts and no custom `40001`. Evidence includes owner-only access across all tables; denial of direct writes and private receipt reads; two customers and two operating companies; 15 independent buildings in overlapping 15- and 10-building portfolios; a 16-building portfolio; contact separation; tenant/customer composite foreign keys; reference scopes; invalid fields; retries; stale versions; contact-trigger rollback; link removal/re-add history; archive/restore; and authority revocation.

Before production, record responsible tester, date, commit and evidence for:

1. Keep migration tracking synchronized in the intended Supabase project. Migration `03100` is locally verified and applied in `abysta-dev`; the final dry-run reports `upToDate=true` with no pending files. Stale directory and image writes now use `STALE_RECORD` with HTTP 409, while API grants and RLS remain unchanged.
2. Use two owner sessions on one tenant to submit different values at the same read version. Exactly one edit succeeds; the other receives `STALE_RECORD`. No contact or link partial update remains.
3. Submit the same request key concurrently from independent connections. One parent/contact/link set is stored and both successful responses identify the same record. Repeat with altered payload; it must fail with `REQUEST_KEY_REUSED`.
4. Hold a transaction while another connection revokes the owner's membership or archives the customer/company. Confirm lock ordering and post-wait authorization/parent checks prevent an operation ordered after the change. Roll back the held session and verify retry works.
5. Verify cross-company and non-owner denials through the actual API, including known UUIDs and historical replay keys.
6. Test actual authenticated browser flows, mobile editing, error focus, dirty-form navigation, image access and image-specific storage policies using the separate media test plan.

The local tests themselves do not modify a hosted database. The separate
development acceptance run and cleanup are recorded in
[`directory-verification-2026-10-02.md`](directory-verification-2026-10-02.md).
Images are covered by the separate media migration, its tests and Storage release
gates. Site visits, calculation rules, finance, quotations, invitations and
scoped team permissions are later milestones.

## Atomic reads for editable records

`get_directory_records(p_tenant_id uuid, p_kind text, p_offset integer = 0,
p_limit integer = 500)` returns `{ records: [...], total: number }`. It verifies
current ownership and returns each parent record and its editable dependent data
in one statement snapshot. Clients and buildings include flattened contact
fields. Portfolios include a `links` array of all current membership records.
The parent `row_version` belongs to exactly those field values.

This prevents a torn read: separate queries might return a newer parent version
with older contact/selection values, letting an apparently valid edit overwrite
another user's changes. Paging is at the parent level, with 1–500 records per
request. Nested links use JSON aggregation and are not truncated to the API's
row limit. The web form snapshots its initial version with its controlled values,
so background refreshes cannot silently refresh only the version token.

The final core suite has 42 named acceptance cases, including authorized atomic
reads, denied callers, pagination and a portfolio containing 1,001 nested links.
The runner reports 43 with the parent test. A real two-session overlap remains a
hosted-development acceptance check; the local runner uses one database session.
