import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, WorkspaceState } from "./types";

// These reads intentionally have no shared cache. Membership revocation must
// take effect on the next server request, including direct database requests.
export async function getWorkspaceState(): Promise<WorkspaceState> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/auth/login");

  const { data: memberships, error: membershipError } = await supabase
    .from("membership")
    .select("tenant_id, role_codes")
    .eq("auth_user_id", auth.user.id)
    .eq("member_type", "internal")
    .eq("status", "active");

  // A missing migration, network error or denied query is NOT an empty company.
  if (membershipError || !memberships) return { kind: "error" };
  if (!memberships.length) return { kind: "ready", workspaces: [] };

  const { data: companies, error: companyError } = await supabase
    .from("operator_tenant")
    .select("id, name, currency, timezone, status")
    .in("id", memberships.map((membership) => membership.tenant_id))
    .eq("status", "active")
    .order("name");

  if (companyError || !companies) return { kind: "error" };
  return {
    kind: "ready",
    workspaces: (companies as Company[]).map((company) => ({
      company,
      roles: memberships.find((membership) => membership.tenant_id === company.id)?.role_codes ?? [],
    })),
  };
}
