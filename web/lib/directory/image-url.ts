export function directoryImageUrl(tenantId: string, assetId: string) {
  return `/api/directory-images/${encodeURIComponent(tenantId)}/${encodeURIComponent(assetId)}`;
}
