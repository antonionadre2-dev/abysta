import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { normaliseDirectoryImage, DIRECTORY_IMAGE_MAX_BYTES } from "@/lib/directory/image-processing";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const missing = () => new Response(null, { status: 404, headers });

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string; assetId: string }> }) {
  const { tenantId, assetId } = await context.params;
  if (!uuid.test(tenantId) || !uuid.test(assetId)) return missing();
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return missing();
    // The asset SELECT and Storage download both evaluate current owner RLS.
    const { data: asset, error } = await supabase.from("asset_version")
      .select("object_name,sha256,byte_size,width,height")
      .eq("tenant_id", tenantId).eq("id", assetId).maybeSingle();
    if (error || !asset) return missing();
    const { data: blob, error: downloadError } = await supabase.storage
      .from("abysta-directory-images").download(asset.object_name);
    if (downloadError || !blob || blob.size > DIRECTORY_IMAGE_MAX_BYTES || blob.size !== Number(asset.byte_size)) return missing();
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return missing();
    // Decode again so direct Storage API callers cannot bypass safe pixel serving.
    const safeImage = await normaliseDirectoryImage(bytes);
    if (safeImage.width !== asset.width || safeImage.height !== asset.height) return missing();
    return new Response(new Uint8Array(safeImage.bytes), {
      headers: { ...headers, "Content-Type": "image/webp", "Content-Disposition": 'inline; filename="abysta-image.webp"' },
    });
  } catch {
    return missing();
  }
}
