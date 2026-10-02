export type DirectoryImageKind = "company" | "client" | "site";
export type DirectoryImageActionState = {
  error?: string;
  conflict?: boolean;
  success?: boolean;
  assetId?: string | null;
  rowVersion?: number;
};
