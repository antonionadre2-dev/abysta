"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateDirectoryForm } from "./validation";
import type { DirectoryActionState } from "./types";

export async function saveDirectoryAction(_previousState: DirectoryActionState, formData: FormData): Promise<DirectoryActionState> {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/auth/login");
  const result = validateDirectoryForm(formData);
  if (!result.ok) return result.state;
  const { kind, tenantId, id, expectedVersion, requestId, data } = result.value;
  let response;
  try {
    // The RPC checks live ownership, parent state, tenancy, version and receipt.
    // It receives no actor or role from the submitted form.
    response = await supabase.rpc("save_directory_record", {
      p_kind: kind, p_tenant_id: tenantId, p_id: id,
      p_expected_version: expectedVersion, p_request_id: requestId, p_data: data,
    });
  } catch {
    return { error: "We couldn’t confirm the save. Keep your details and try again; we’ll check the same request." };
  }
  if (response.error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: "Your session has expired. Sign in again.",
      FORBIDDEN: "Your permission has changed. Only an active company owner can manage this directory.",
      RECORD_NOT_FOUND: "This record is no longer available. Return to your client list.",
      STALE_RECORD: "Someone changed this record after you opened it. Your changes have not been saved. Open the latest version and review it before editing again.",
      INVALID_INPUT: "Check the details and try again.",
      PARENT_ARCHIVED: "This client is archived. Restore the client before changing its buildings or portfolios.",
      IMMUTABLE_CLIENT: "This record belongs to a different client. Open it from the correct client page.",
      DUPLICATE_REFERENCE: "This reference is already in use. Enter a different reference or leave it empty.",
      REQUEST_KEY_REUSED: "This request was already saved with different details. Open the latest record before making another change.",
      INVALID_SITE_SELECTION: "Check your building selection. Buildings must belong to this client; archived buildings cannot be newly added.",
    };
    return {
      error: messages[response.error.message] ?? "We couldn’t save the record. Your entries are still here; please try again shortly.",
      conflict: ["STALE_RECORD", "REQUEST_KEY_REUSED"].includes(response.error.message),
      ...(response.error.message === "DUPLICATE_REFERENCE" ? { fieldErrors: { reference: "This reference is already in use." } } : {}),
    };
  }
  if (response.data !== id) return { error: "We couldn’t confirm the save. Open your client list before trying again." };
  const base = `/protected/workspaces/${tenantId}/clients`;
  revalidatePath(base, "layout");
  const destination = kind === "client" ? `${base}/${id}`
    : `${base}/${data.client_company_id}/${kind === "site" ? "buildings" : "portfolios"}/${id}`;
  redirect(destination);
}
