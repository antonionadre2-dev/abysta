# Directory images: implementation and release checks

This phase provides an operator company logo, a client logo and one building photograph per record. The interface is English. Only active internal owners of an active operator company can view or change directory images. An administrator role by itself does not grant access in this release.

## User flow

Save the client or building first. Choose a PNG, JPEG or WebP still image up to 3 MiB, then choose **Upload image** or **Replace image**. The server decodes real pixels, rejects more than 25 million input pixels and animated/multipage input, applies orientation, fits within 1,600 × 1,600 pixels without enlargement, and writes metadata-free WebP. The filename is never used as an object path. Transparency is retained.

Removing an image requires confirmation and clears only the current pointer. Replacement creates a new version and a new immutable object. Earlier registered versions remain privately retained; this milestone does not provide a version browser or a retention/erasure workflow. Upload controls display pending, failure and optimistic-concurrency conflict states. An interrupted upload retains its request identifiers while the page remains open. Each successful response updates the current parent version and asset in local state, so upload, replacement and removal can be performed consecutively without a stale token. A changed parent record requires review and refresh before another image save.

## Storage and data model

The migration provisions the private `abysta-directory-images` bucket with a 3 MiB object limit and `image/webp` allowlist. No existing unrelated bucket is changed. Objects are uploaded through the Storage API; SQL never writes or deletes object metadata.

Paths are generated as `tenant UUID / company|client|site / parent UUID / asset UUID.webp`. Insert policies require the current internal owner, matching object ownership, a valid path and an active parent. For building uploads, its client must also be active. No authenticated update or delete is granted for this bucket. Restrictive policies prevent an unrelated broad permissive policy from widening access.

`asset_version` has a composite `(tenant_id,id)` primary key, creator, parent binding, typed tenant-aware foreign keys, SHA-256, actual byte size and dimensions. Application roles have SELECT only. The logo/image pointer on the parent has a tenant-aware FK. Only the image RPC writes a pointer and it derives the authenticated actor itself. A client asset cannot be rebound to a building, another client or another tenant. Version rows cannot be updated or deleted by application roles; parent FKs prevent deleting referenced clients/buildings.

`POST /api/directory-images` accepts only same-origin multipart requests with a declared body length from 1 byte through 4 MiB and authenticates before materialising the body. The image itself remains limited to 3 MiB. `set_directory_image` checks authority and active parent before replaying a receipt. It locks company, active owner membership and parent rows, verifies `row_version`, checks uploaded object path/owner/MIME/size, then commits the asset version, pointer and private request receipt together. Storage upload and SQL commit are not one distributed transaction: see orphan handling below. A same-request retry returns the original result; changed payload under that key fails. Removing a pointer also uses the version and receipt checks.

## Private delivery and revocation

The browser requests `/api/directory-images/{tenantId}/{assetId}` with its session cookie. Every request verifies the user, reads the asset through current owner RLS and downloads through current Storage RLS. The proxy checks byte length and SHA-256 and decodes/re-encodes the bytes before serving them, so direct Storage API uploads cannot bypass safe raster output. Responses, including failures, use private `no-store`, `nosniff`, same-origin resource policy and a restrictive CSP. The application never emits public or signed image URLs or uses a public image optimiser.

Storage SELECT is limited to the documented authenticated download/info operations. Signed URL creation, signed uploads and listing operations are denied even for owners, to prevent a signed download from remaining usable after membership revocation. Consequently migration requires `storage.allow_any_operation(text[])` supplied by current Supabase Storage; it fails clearly if absent. Do not remove this safeguard to force deployment. Update the Storage service or resolve the hosted version first. Service-role and project-administrator access remains privileged platform access, outside end-user RLS.

Access revocation stops subsequent authorised server reads; it cannot erase image pixels a permitted user has already seen or saved. Archived client/building images remain privately readable to owners for record review, but mutation is blocked until the parent and client are restored. Archiving the operator company blocks all reads and writes.

## Failure, retries and retained objects

If an upload finishes but registration fails (for example another window changes the parent), an unregistered object can remain. The application deliberately never deletes an object after an ambiguous network failure because registration could already have committed. Unregistered objects have no end-user read policy. A same-page retry first attempts the same registration receipt and then only uploads if the database reports a missing upload.

A future operator cleanup job must identify aged unregistered objects, recheck no `asset_version` references and no in-flight reservation, and delete bytes through the Storage API using controlled maintenance credentials. No cleanup job or end-user delete permission ships here. Monitor retained/orphan storage volume. Do not delete Storage metadata with SQL.

## Local evidence versus hosted release gate

`node --experimental-strip-types --test tests/directory-images.test.mjs` from `web` contains six actual Sharp cases for decoding, scaling, EXIF orientation/stripping, alpha, corrupt/truncated input and byte/pixel limits, plus one case for the same-origin, multipart and request-size header gate.

`node --test ../supabase/tests/directory-images.test.mjs` from `web` runs the real three migrations in disposable PostgreSQL (PGlite). Minimal Auth and Storage metadata/operation shims supply the platform tables/functions. Cases check owner/tenant boundaries, parent binding, archive/revocation, MIME/size metadata, optimistic versions, retries, version retention, denied direct writes, signed-operation denial and broad-policy resistance. They do **not** test real Storage HTTP endpoints or simultaneous database sessions.

Before accepting this milestone on a development Supabase project:

1. Apply migrations and verify the bucket is private with WebP-only/3 MiB settings and the operation helper exists.
2. Upload company/client logos and a building JPEG. Confirm orientation, transparency where relevant, a correct image after refresh and no public URL in rendered markup.
3. Replace, remove and retry after an interrupted connection. Confirm new asset IDs, one revision per successful request and retained previous objects.
4. Call the Storage API directly: anonymous, other-tenant and non-owner reads/inserts fail; malformed paths, update/upsert and delete fail. Owner authenticated download succeeds, but signed download/upload URL creation, signed uploads and object listing fail.
5. Test actual API MIME/size enforcement. Try invalid image bytes claiming WebP; the application proxy must return 404 and must never render executable content.
6. Revoke an owner while retaining the existing cookie, then reload the proxy URL. It must return 404 with no-store. Restore access only through the authorised admin process.
7. In two real database sessions, overlap image registration with parent editing/archival and membership revocation; verify one consistent committed outcome and no stale overwrite.
8. Inspect success and failure image response headers. Confirm deployment supports Node/Sharp, the Route Handler's 4 MiB request limit, required same-origin `Origin` header and session cookies.

## Primary references consulted

- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Bucket creation and upload limits: https://supabase.com/docs/guides/storage/buckets/creating-buckets
- Storage operation helper predicates: https://supabase.com/docs/guides/storage/schema/helper-functions
- Storage schema and API-only object operations: https://supabase.com/docs/guides/storage/schema/design
- Sharp constructor and pixel limits: https://sharp.pixelplumbing.com/api-constructor/
- Installed Next.js 16 Route Handler documentation in `web/node_modules/next/dist/docs`.
