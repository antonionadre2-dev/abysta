import "server-only";
import { normaliseDirectoryImage, DIRECTORY_IMAGE_MAX_BYTES } from "@/lib/directory/image-processing";
import { createClient } from "@/lib/supabase/server";
import type { DirectoryImageActionState } from "@/lib/directory/image-types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (form: FormData, key: string) => {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
};
const errors: Record<string, string> = {
  FORBIDDEN: "Your access has changed. Refresh this page before trying again.",
  PARENT_ARCHIVED: "Restore this record and its client before changing the image.",
  RECORD_NOT_FOUND: "This record is no longer available.",
  REQUEST_KEY_REUSED: "This upload has changed. Choose the image again and retry.",
  INVALID_IMAGE: "Choose a valid PNG, JPEG or WebP image up to 3 MiB.",
  IMAGE_ALREADY_REGISTERED: "This image request has already been used. Refresh the page.",
};

export async function saveDirectoryImage(form: FormData): Promise<DirectoryImageActionState> {
  const tenantId = one(form, "tenant_id").toLowerCase();
  const recordId = one(form, "record_id").toLowerCase();
  const kind = one(form, "kind");
  const requestId = one(form, "request_id");
  const assetId = one(form, "asset_id").toLowerCase();
  const operation = one(form, "operation");
  const versionText = one(form, "expected_version");
  const rowVersion = Number(versionText);
  if (![tenantId, recordId, requestId].every((value) => uuid.test(value)) ||
      !["company", "client", "site"].includes(kind) ||
      !["upload", "remove"].includes(operation) ||
      !/^[1-9][0-9]*$/.test(versionText) || !Number.isSafeInteger(rowVersion) ||
      (operation === "upload" && !uuid.test(assetId))) {
    return { error: "The image request is incomplete. Refresh the page and try again." };
  }
  // Fresh getUser verification; database and Storage policies check live owner
  // membership again before every operation.
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { error: "Sign in again before changing this image." };
  }
  let processed: Awaited<ReturnType<typeof normaliseDirectoryImage>> | null = null;
  if (operation === "upload") {
    const files = form.getAll("image");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File) || !file.size || file.size > DIRECTORY_IMAGE_MAX_BYTES) {
      return { error: "Choose a PNG, JPEG or WebP image up to 3 MiB." };
    }
    try {
      processed = await normaliseDirectoryImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      return { error: "This image could not be read. Use a still PNG, JPEG or WebP up to 3 MiB and 25 megapixels." };
    }
  }
  const params = {
    p_kind: kind, p_tenant_id: tenantId, p_record_id: recordId,
    p_expected_version: rowVersion, p_request_id: requestId,
    p_asset_id: processed ? assetId : null,
    p_sha256: processed?.sha256 ?? null,
    p_width: processed?.width ?? null, p_height: processed?.height ?? null,
    p_byte_size: processed?.byteSize ?? null,
  };
  try {
    // Try registration first: a response-lost retry can return the original receipt.
    let result = await supabase.rpc("set_directory_image", params);
    if (processed && result.error?.message === "IMAGE_UPLOAD_MISSING") {
      const objectName = `${tenantId}/${kind}/${recordId}/${assetId}.webp`;
      const uploaded = await supabase.storage.from("abysta-directory-images").upload(objectName, processed.bytes, {
        contentType: "image/webp", cacheControl: "0", upsert: false,
      });
      // Always check registration after an upload response: the bytes may have
      // committed despite an error, or already exist from an earlier attempt.
      result = await supabase.rpc("set_directory_image", params);
      if (uploaded.error && result.error?.message === "IMAGE_UPLOAD_MISSING") {
        return { error: "The image could not be uploaded. Keep this page open and retry." };
      }
    }
    if (result.error) {
      if (result.error.message === "STALE_RECORD") {
        return { error: "This record changed in another window. Refresh the page, review the changes and select your image again.", conflict: true };
      }
      return { error: errors[result.error.message] ?? "We could not confirm the save. Keep this page open and retry." };
    }
    const nextVersion = Number(result.data);
    if (!Number.isSafeInteger(nextVersion) || nextVersion < 1) {
      return { error: "We could not confirm the save. Keep this page open and retry." };
    }
    return { success: true, assetId: processed ? assetId : null, rowVersion: nextVersion };
  } catch {
    // Do not remove uploaded objects: registration may have committed before failure.
    return { error: "The connection was interrupted. Keep this page open and retry to check the same save." };
  }
}
