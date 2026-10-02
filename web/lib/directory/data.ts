import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "./validation";
import type { ClientRecord, CompanyRecord, DirectoryKind, DirectorySnapshot, PortfolioLink, PortfolioRecord, SiteRecord } from "./types";

// The directory is owner-only until scoped grants for colleagues are shipped.
// Each request checks live membership; nothing here enters a shared data cache.
export async function getDirectoryContext(tenantId: string) {
  if (!isUuid(tenantId)) notFound();
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/auth/login");
  const { data: membership, error: membershipError } = await supabase.from("membership")
    .select("role_codes").eq("tenant_id", tenantId).eq("auth_user_id", auth.user.id)
    .eq("member_type", "internal").eq("status", "active").maybeSingle();
  if (membershipError) throw new Error("Your directory could not be loaded. Please try again.");
  if (!membership?.role_codes?.includes("owner")) notFound();
  const { data: company, error } = await supabase.from("operator_tenant")
    .select("id,name,currency,timezone,row_version,logo_asset_id")
    .eq("id", tenantId).eq("status", "active").maybeSingle();
  if (error) throw new Error("Your directory could not be loaded. Please try again.");
  if (!company) notFound();
  return { supabase, user: auth.user, company: company as CompanyRecord };
}

type PortfolioWithLinks = PortfolioRecord & { links: PortfolioLink[] };

export async function getDirectorySnapshot(tenantId: string): Promise<DirectorySnapshot> {
  const { supabase, company } = await getDirectoryContext(tenantId);
  // Each parent, its row_version, and editable contacts/memberships are returned
  // in ONE database statement. Separate queries could combine a new version with
  // old child values and let a later edit overwrite changes without a conflict.
  async function allRecords<T>(kind: DirectoryKind): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ;) {
      const { data, error } = await supabase.rpc("get_directory_records", {
        p_tenant_id: tenantId, p_kind: kind, p_offset: offset, p_limit: 500,
      });
      if (error || !data || !Array.isArray(data.records) || typeof data.total !== "number") {
        throw new Error("Your directory could not be loaded. Please try again.");
      }
      rows.push(...(data.records as T[]));
      offset += data.records.length;
      if (!data.records.length || offset >= data.total) break;
    }
    return rows;
  }
  const [clients, sites, portfolioRecords] = await Promise.all([
    allRecords<ClientRecord>("client"), allRecords<SiteRecord>("site"),
    allRecords<PortfolioWithLinks>("portfolio"),
  ]);
  return {
    company,
    clients: clients.sort((a, b) => a.legal_name.localeCompare(b.legal_name)),
    sites: sites.sort((a, b) => a.name.localeCompare(b.name)),
    portfolios: portfolioRecords.map((record) => { const portfolio = { ...record }; Reflect.deleteProperty(portfolio, "links"); return portfolio; }).sort((a, b) => a.name.localeCompare(b.name)),
    links: portfolioRecords.flatMap((portfolio) => portfolio.links),
  };
}
