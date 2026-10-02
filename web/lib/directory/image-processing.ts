import sharp from "sharp";
import { createHash } from "node:crypto";

export const DIRECTORY_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const formats = new Set(["jpeg", "png", "webp"]);

/** Server-side pixel decoding, EXIF rotation, resizing and metadata removal. */
export async function normaliseDirectoryImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > DIRECTORY_IMAGE_MAX_BYTES) {
    throw new Error("IMAGE_SIZE");
  }
  const input = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await input.metadata();
  if (!formats.has(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) {
    throw new Error("IMAGE_FORMAT");
  }
  const { data, info } = await input
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > DIRECTORY_IMAGE_MAX_BYTES) throw new Error("IMAGE_SIZE");
  return {
    bytes: data,
    width: info.width,
    height: info.height,
    byteSize: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}
