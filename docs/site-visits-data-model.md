# Site Visits 3A — database contract and verification

Implemented by `supabase/migrations/20261002003000_site_visits.sql` after the company and directory migrations. This is an online, owner-only draft questionnaire. It does not implement zones, media attachments, costing, delegated assignment, approval, completion or offline synchronisation.

## Entities and relationships

| Entity | Purpose | Integrity |
| --- | --- | --- |
| `site_visit` | Stable identity within one tenant, client and building; pointer to the current saved revision | Composite building/client/tenant foreign key. Identity, original creator and creation timestamp cannot change. |
| `visit_revision` | A complete immutable saved draft | Composite parent visit foreign key includes tenant, client and building. Unique sequential revision number within the visit. |
| `abysta_private.site_visit_request` | Save request receipt, private to server functions | Key: authenticated actor + tenant + request UUID. Retains normalized payload and original expected version. |

Each successful save with a new request UUID inserts one complete revision. A new save of unchanged content still creates a revision. Replaying the same request with the same normalized payload returns the original visit identity without changing the current revision. Reusing that receipt with different identity, ancestry, expected version or payload fails with `REQUEST_KEY_REUSED`.

A deferred composite foreign key constrains `site_visit.(tenant_id,id,current_revision_id,row_version)` to `visit_revision.(tenant_id,site_visit_id,id,revision_number)`. The current revision cannot belong to another visit or carry a different revision number. The identity, revision and receipt commit together; a failure rolls all three back.

Database triggers reject revision updates and deletes, and reject visit deletion or changes to its ancestry. This provides immutable application history, not a claim that a database administrator cannot alter the database or remove its safeguards. The application offers no physical deletion route. Any future retention/deletion process requires a deliberate reviewed migration and policy.

## Frozen snapshots

Every revision captures these exact parent properties while its parent rows are locked:

- Client: `id`, `legal_name`, `reference`, `address`.
- Building: `id`, `name`, `reference`, `address`, `timezone`, `building_type`.
- Template: the complete questionnaire key, version, sections, prompts, answer types, allowed selections, required flags and numeric bounds.
- Answers and the user-entered visit details, including contact and responsible-person label.

Editing the current client, building or portfolio membership never changes an old revision. A subsequent save captures the then-current parent data. This distinction must remain visible in the interface. There is no portfolio ID on a visit: a building retains the same visit history regardless of which portfolios include it.

`lead_name` is a free-text attribution label. It does not assign a user or grant access. `created_by` and `updated_by` derive from the current authenticated user; the caller cannot supply them.

## Typed questionnaire

`web/lib/site-visits/questionnaire.json` is the authoritative source of the initial `office-cleaning-v1` template. The migration freezes an identical copy in a private immutable helper. The SQL test compares the saved template with that source file. A future schema change must deliberately version the template; editing only the UI JSON is insufficient.

There are sixteen fixed question IDs. Every request supplies exactly those IDs and exactly four properties per answer: `state`, `value`, `source`, `note`.

| State | Value and provenance | Explanation |
| --- | --- | --- |
| `unanswered` | JSON null; empty source | Empty note, so a hidden partial response cannot masquerade as blank |
| `unknown` | JSON null; empty source | Nonblank note required |
| `not_applicable` | JSON null; empty source | Nonblank note required; only permitted on questions allowing NA |
| `answered` | Correct typed value; allowed nonempty source | Note optional |

An answered Boolean is a real Boolean; `false` means No, not unanswered. Numbers must be JSON numbers, finite whole values within the question's minimum and maximum; zero remains zero. Text must contain 1–2,000 Unicode code points after trimming. Select values must be one of the declared codes. Allowed provenance: client, observed, measured, estimated, plan, document. No artificial AI source or confidence claim is introduced.

All required questions may remain unanswered while saving a draft. Required flags inform follow-up readiness; they are not permission to claim a completed or approved survey. The only saved statuses are `draft` and `in_progress`.

Top-level field lengths and types are enforced independently in SQL. Date is empty or a real `YYYY-MM-DD` calendar date from 1900-01-01 through 2100-12-31, stored as SQL null when empty. Contact name is required whenever email, phone or role is populated. JS-compatible Unicode trimming and code-point lengths are applied. Notes and answer text/notes allow tab, LF and CR; other embedded ASCII control characters are rejected. Single-line fields reject embedded control characters.

## Authorization and safe saves

Only a currently active **internal owner** of an active operator company may read or write. An admin, salesperson, external client member, suspended member or revoked member receives no implicit access. Company ownership in the UI is not trusted as authorization evidence.

The save function takes locks in this order:

1. Active operator tenant, `FOR SHARE`.
2. Active internal owner membership, `FOR SHARE`.
3. Actor/tenant/request advisory lock.
4. Client, then building, `FOR UPDATE` in directory-compatible ancestry order.
5. Existing visit, `FOR UPDATE`.

Current authority and active client/building are checked before a successful receipt can be replayed. Archived parents remain readable to authorized owners but block all visit saves, including retries. Concurrent revocation or archive either precedes the save and blocks it, or waits for its transaction to finish.

Expected version zero creates a new visit. A positive expected version must equal the current stored version. A stale form receives `STALE_RECORD`; there is no silent last-write-wins behaviour. Expected version must be below JavaScript's maximum safe integer so the increment remains safe.

Authenticated users have only SELECT grants on the two public tables, with owner RLS. Direct INSERT, UPDATE and DELETE are denied. Private helpers and receipts have no authenticated execute/read grants. Exposed functions use fixed empty search paths, qualified references, definer execution and explicit authenticated-only execute grants. Input JSON rejects extra fields, including actor, parent, permission and approval spoofing.

## RPCs

| Function | Result |
| --- | --- |
| `save_site_visit(tenant,client,site,id,expected_version,request_id,data)` | Stable visit UUID |
| `get_site_visit(tenant,client,site,id,revision_number default null)` | `{visit,revision}`; current revision by default, selected historical revision otherwise |
| `list_site_visits(tenant,client,site,offset default 0,limit default 50)` | `{records,total,snapshot_token}` with current summary for each visit |
| `list_visit_revisions(tenant,client,site,id,offset default 0,limit default 50)` | `{records,total,snapshot_token}` ordered by descending revision number |

All read RPCs independently validate current owner authority and route ancestry. The read functions are STABLE: authority checks, ancestry and results share the calling statement's snapshot. Detail loads join the visit and revision in one SQL query so a version token cannot be paired with another save's answers.

Lists accept nonnegative offset and limit 1–100. Visits sort by last update descending, then stable UUID; histories sort by revision descending. The visit list token is `count:sum(row_version)`. Revision history token is its revision count. As saves are append-only and versions increase, either token changes when its relevant collection changes. A repeated successful request does not change tokens. The web reader compares tokens across pages, restarts a bounded number of times on drift and fails visibly if it cannot obtain a stable collection; it must not silently return a partial or duplicated list. Each RPC result is a JSON envelope to avoid nested row truncation.

A selected historical revision is read-only in the application. The `visit` object still describes the stable identity/current pointer; the selected `revision_number` explicitly identifies the historical content.

## Errors

- `AUTH_REQUIRED`: no authenticated actor.
- `FORBIDDEN`: no active internal-owner authority in the target active company.
- `RECORD_NOT_FOUND`: missing record or mismatched route ancestry.
- `PARENT_ARCHIVED`: archived client or building blocks save.
- `STALE_RECORD` (`PT409` / HTTP 409): expected version no longer current, or
  create identity collision. It is deliberately not SQLSTATE `40001`, because
  retrying the same obsolete expected version cannot resolve the conflict.
- `REQUEST_KEY_REUSED`: same actor/tenant/request UUID used for a different operation.
- `INVALID_INPUT`: invalid shape, type, enum, size, date, answer or pagination.
- `IMMUTABLE_SITE`: an existing visit cannot be moved.

Trigger-only `IMMUTABLE_VISIT_HISTORY` and `INVALID_VISIT_VERSION` guard privileged misuse and are not ordinary UI actions.

## Evidence and remaining gates

Run from the repository root:

```sh
node --test supabase/tests/site-visits.test.mjs
```

The suite executes the actual company, directory and site-visit migrations in disposable PGlite PostgreSQL with a minimal Auth shim. **42 named acceptance cases pass** (43 including the parent runner).

Covered: 15 stable buildings and ten independent visits, shared portfolio membership, frozen parent/template history, real false/zero versus unknown, every typed answer state, exact JSON allowlists, Unicode/date validation, optimistic conflicts, normalized retries, receipt privacy, owner RLS, anonymous and non-owner denial, no direct writes, parent archive, membership revocation, different tenant and actor receipts, immutable history triggers, ancestry/current-pointer foreign keys, rollback after forced revision failure, paginated summaries and drift tokens.

The disposable PGlite suite alone is not hosted Supabase/PostgREST or
two-connection concurrency evidence, and it does not change a hosted database.
Those cases were also exercised in `abysta-dev` with real Auth, PostgREST and
separate sessions; the 12/12 result, `PT409` correction and exact fixture cleanup
are recorded in `docs/site-visits-3a-verification-2026-10-02.md`. Remaining gates
are a real-device touch pass, an explicit retention/deletion policy for visit
history and receipts, and a fresh acceptance run in production before release.
