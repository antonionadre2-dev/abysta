export const COMPANY_CURRENCIES = ["GBP", "CHF", "EUR", "USD"] as const;
export type CompanyCurrency = (typeof COMPANY_CURRENCIES)[number];

export type Company = {
  id: string;
  name: string;
  currency: CompanyCurrency;
  timezone: string;
  status: "active" | "archived";
};

export type Workspace = { company: Company; roles: string[] };
export type CompanyValues = {
  name: string;
  currency: string;
  timezone: string;
  requestId: string;
};

export type CompanyActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "currency" | "timezone", string>>;
  values?: CompanyValues;
};

export type WorkspaceState =
  | { kind: "ready"; workspaces: Workspace[] }
  | { kind: "error" };
