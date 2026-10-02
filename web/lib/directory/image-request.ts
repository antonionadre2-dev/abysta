export const DIRECTORY_IMAGE_REQUEST_MAX_BYTES = 4 * 1024 * 1024;

type RequestGate =
  | { ok: true }
  | { ok: false; status: 403 | 413 | 415; error: string };

export function validateDirectoryImageRequestHeaders(
  requestUrl: string,
  headers: Pick<Headers, "get">,
): RequestGate {
  const origin = headers.get("origin");
  if (!origin || origin !== new URL(requestUrl).origin) {
    return { ok: false, status: 403, error: "This image request is not allowed." };
  }

  const contentType = headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { ok: false, status: 415, error: "This image request is not valid." };
  }

  const contentLengthHeader = headers.get("content-length");
  const contentLength = contentLengthHeader && /^[1-9][0-9]*$/.test(contentLengthHeader)
    ? Number(contentLengthHeader)
    : Number.NaN;
  if (!Number.isSafeInteger(contentLength) || contentLength > DIRECTORY_IMAGE_REQUEST_MAX_BYTES) {
    return { ok: false, status: 413, error: "Choose a PNG, JPEG or WebP image up to 3 MiB." };
  }

  return { ok: true };
}
