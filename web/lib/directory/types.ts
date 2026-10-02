export type DirectoryKind = "client" | "portfolio" | "site";
export type RecordStatus = "active" | "archived";
export type BuildingType = "office" | "retail" | "industrial" | "residential" | "education" | "healthcare" | "hospitality" | "mixed_use" | "other";

export type CompanyRecord = {
  id: string; name: string; currency: string; timezone: string;
  row_version: number; logo_asset_id: string | null;
};
export type DirectoryBase = {
  tenant_id: string; id: string; reference: string; notes: string;
  status: RecordStatus; row_version: number; created_at: string; updated_at: string;
};
export type ContactFields = {
  contact_name: string; contact_email: string; contact_phone: string; contact_role: string;
};
export type ClientRecord = DirectoryBase & ContactFields & {
  legal_name: string; address: string; image_asset_id: string | null;
};
export type SiteRecord = DirectoryBase & ContactFields & {
  client_company_id: string; name: string; address: string; timezone: string;
  building_type: BuildingType; image_asset_id: string | null;
};
export type PortfolioRecord = DirectoryBase & {
  client_company_id: string; name: string;
};
export type PortfolioLink = {
  id: string; tenant_id: string; client_company_id: string;
  portfolio_id: string; site_id: string; left_at: string | null;
};
export type DirectorySnapshot = {
  company: CompanyRecord; clients: ClientRecord[]; sites: SiteRecord[];
  portfolios: PortfolioRecord[]; links: PortfolioLink[];
};
export type DirectoryActionState = {
  error?: string; fieldErrors?: Record<string, string>; conflict?: boolean;
};
export type DirectoryPayload = Record<string, string | string[]>;
