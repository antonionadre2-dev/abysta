# Site Visits 3B — structure and measurement contract

Base: `5bf9437dcef4dbe74464e8d30f0713af9559363b`. Migration: `20261002004000_site_visit_layout.sql`.

## Ownership and relationships

`site_floor` and `site_zone` hold append-only identities. Floors belong to one
operator/client/building; zones belong to one fixed floor in that same ancestry.
Globally unique UUIDs and sorted advisory identity locks prevent an identity being
reused in another building or as both a floor and zone. UUIDs are identifiers,
not authorization. RLS and RPC checks enforce active internal ownership.

`site_inventory` holds the current reusable structure for a building: floor
IDs/names/references/levels and zone IDs/floor IDs/names/references/types. It has
no portfolio ownership. Sharing a site across portfolios shares that structure.
An absent inventory reads as version 0 with empty arrays. The row version advances
only when structure or order changes, not when a visit's measurements change.
Omitted identities remain in their tables, preserving historical ancestry.

`visit_revision.layout_snapshot` contains the full frozen observations and
structure for that revision. It is nullable for 3A history. Existing rows are
not rewritten. The snapshot contains schema version 1 and the resulting inventory
version, rather than references to mutable names or measurements.

| Data | Current shared inventory | Frozen visit snapshot |
| --- | --- | --- |
| Floor/zone IDs and placement | Yes | Yes |
| Names, references, level, zone type | Yes | Yes |
| Service inclusion/exclusion and reason | No | Yes |
| Floor/glass area, edge length, fixture count/type | No | Yes |
| Measurement states, sources and reasons | No | Yes |
| Material, condition, occupancy, obstacles, access, notes | No | Yes |
| Gross/reference building area | No | Yes |

## Writes and concurrency

`save_site_visit` retains its signature and accepts the legacy 12-field payload,
or those fields plus `layout`. Exact key allowlists apply recursively. A legacy
payload carries forward the previous layout snapshot of that visit, or null for a
new legacy visit. It does not mutate inventory. Old normalized receipts remain
comparable because no layout default is added to their payload.

The function validates authority and holds tenant/membership share locks; then
locks the request, client and site in the established order. Active ancestry is
checked before receipt replay. Matching receipts return before optimistic checks,
so retries cannot become stale solely because later work was saved. Different
payloads under the same request key fail with `REQUEST_KEY_REUSED`.

For a layout-bearing new request, the site lock serializes first inventory
creation and subsequent inventory edits. The expected inventory version is
checked independently of expected visit version. The function validates stable
identities, registers missing identities, updates structure when changed, inserts
the new revision snapshot, advances the visit pointer and records the receipt in
one transaction. A failure rolls all these changes back.

`STALE_RECORD` and `STALE_INVENTORY` use SQLSTATE `PT409`, preserving the published
PostgREST conflict fix. Identity misuse is `INVALID_LAYOUT_ID`; oversize payloads
are `PAYLOAD_TOO_LARGE`. All RPCs use fixed empty search paths. No authenticated
caller has direct table mutation privileges; private helpers are not executable
by clients. Ordinary privileged DML is also blocked from changing identities and
revision history, although a database administrator can change the schema itself.

`get_site_inventory` is a stable owner-scoped read with the same ancestry checks
as visit reads. `get_site_visit` already serializes the entire revision atomically
with its visit pointer and therefore includes the new snapshot column. Archived
client/site records remain readable by owners; saves and receipt replay require
active parents. Revocation is checked using current membership, not a cached role.

## Client behavior

New visits copy only structure and reset all observations. Existing visits use
their own snapshot. If its inventory version differs from current structure,
explicit reconciliation is required: retain observations by stable ID, adopt
current labels, add blank new zones and explain removals. Historical pages always
render the snapshot; they never rebuild it by joining current inventory.

A background refresh does not replace the mounted draft or expected visit token.
A conflict freezes saving while entries remain visible. A new visit's inventory
conflict recovers to the new-visit route after explicit discard; ambiguous request
replay retains canonical visit-ID recovery. No merge or offline persistence is
claimed. Browser exit prompts are best-effort, not a backup.

## Quantities and limits

All measurements use `{state,value,source,note}`. States: unanswered, answered,
unknown, not_applicable. Unknown and N/A require a reason and null value. Answered
requires a finite nonnegative quantity and measured/client/plan/estimated/document
source. Unanswered retains no hidden value, source or note. Zero is explicit.

Units are fixed: floor/glass/reference area m²; edge length m; fixture count items.
Quantities have at most two decimal places, with integer fixture counts, bounded
at 10,000,000 each. Counts require a fixture type. No conversion or productivity
calculation exists yet. Numeric sums use integer hundredths; glass/reference area
never enter floor totals. Included, excluded and undecided floor subtotals are
separate. Invalid draft numbers are excluded and shown as pending rather than
rounded into plausible totals. Estimated quantities remain identifiable.

Each active structure has at most 50 floors and 300 zones. Empty floors and empty
structures remain valid drafts with visible coverage gaps. Measurement notes are
500 Unicode code points; zone narrative fields 1,000, occupancy 200, names/material/
fixture type 100, references 40 and floor level 20. Single-line/multiline control
policies match the 3A questionnaire. UUID whitespace/case is normalized.

The application rejects JSON above 512,000 UTF-8 bytes before the RPC. PostgreSQL
also rejects `octet_length(convert_to(p_data::text,'UTF8')) > 512000`: its JSONB text representation
includes formatting, so it can conservatively reject a payload slightly below
the browser-side bound. The database is the final storage gate and returns a useful
size error. Next.js Server Action request allowance is 2 MB for encoding/multipart
overhead; it does not relax the per-visit bound. Some combinations of maximum
field lengths reach the byte limit before the 300-zone limit.

## Verification boundaries

The SQL tests run actual migrations in disposable PGlite with minimal Auth and
Storage shims. The original 42 visit SQL cases now also run after 04000. The new
suite tests an actual pre-migration legacy receipt and snapshot, migrations through
03100, ten inventories in fifteen buildings with shared portfolio membership,
identity integrity, rollback, version checks, access and payload constraints.
PGlite's single connection does not prove simultaneous production transactions or
PostgREST HTTP behavior. These remain explicit hosted acceptance cases.

Browser evidence uses real UI components and synthetic fixture actions, labelled
VISUAL QA · SAMPLE DATA. It verifies rendering and client behavior, not Supabase
persistence. No production or hosted-development deployment is implied by this
package. Photos/plans/video, approvals, service-task scope revisions, labour/costs,
exports, campaigns and delegated team permissions remain outside 3B.
