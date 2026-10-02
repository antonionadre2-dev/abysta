"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateSiteVisitForm } from "./validation";
import type { VisitActionState } from "./types";

export async function saveSiteVisitAction(_previous:VisitActionState,formData:FormData):Promise<VisitActionState> {
  const result=validateSiteVisitForm(formData);
  if (!result.ok) return result.state;
  const supabase=await createClient();
  const identity=await supabase.auth.getUser().catch(()=>null);
  // Returning an error keeps the controlled draft visible during session expiry.
  if (!identity || identity.error || !identity.data.user) return {error:"We couldn’t verify your session. Try again, or sign in in another tab and return here to save. Your entries are still in this form."};
  const {tenantId,clientId,siteId,id,expectedVersion,requestId,data}=result.value;
  let response;
  try {
    response=await supabase.rpc("save_site_visit",{p_tenant_id:tenantId,p_client_id:clientId,p_site_id:siteId,p_id:id,p_expected_version:expectedVersion,p_request_id:requestId,p_data:data});
  } catch {
    return {error:"We couldn’t confirm the save. Keep your entries unchanged and try Save draft again; we’ll check the same request."};
  }
  if (response.error) {
    const messages:Record<string,string>={
      AUTH_REQUIRED:"Your session has expired. Sign in in another tab, then return and save again.",
      FORBIDDEN:"Your access has changed. Only an active company owner can save site visits in this release.",
      RECORD_NOT_FOUND:"This visit or building is no longer available. Open the building in another tab to check.",
      PARENT_ARCHIVED:"This client or building is archived. Restore it before saving a visit.",
      STALE_RECORD:"This visit has changed since you opened it. Your entries are preserved below; review the current saved version before editing again.",
      STALE_INVENTORY:"The building structure changed in another visit. Your entries are preserved. Open the saved visit or building in another tab, then reload and use the current building structure before saving.",
      REQUEST_KEY_REUSED:"This request was already saved with different details. Your entries are preserved; open the saved visit to check what was recorded.",
      IMMUTABLE_SITE:"A visit cannot be moved to another building. Open it from its original building.",
      PAYLOAD_TOO_LARGE:"This visit exceeds the 512 KB storage limit. Shorten long notes or reduce the number of zones before saving.",
      INVALID_LAYOUT_ID:"A floor or zone identity belongs to a different building or placement. Remove that draft item and add it again with a new identity.",
      INVALID_INPUT:"The visit contains invalid details. Check your answers and try again.",
    };
    return {error:messages[response.error.message]??"We couldn’t confirm the save. Keep your entries unchanged and try again; the same request will be checked.",conflict:["STALE_RECORD","STALE_INVENTORY","REQUEST_KEY_REUSED"].includes(response.error.message),conflictKind:response.error.message==="STALE_INVENTORY"?"inventory":response.error.message==="STALE_RECORD"?"visit":response.error.message==="REQUEST_KEY_REUSED"?"request":undefined};
  }
  if (response.data!==id) return {error:"We couldn’t confirm the saved visit. Open the building in another tab before retrying."};
  const base=`/protected/workspaces/${tenantId}/clients/${clientId}/buildings/${siteId}`;
  revalidatePath(`/protected/workspaces/${tenantId}/clients`,"layout");
  redirect(`${base}/visits/${id}`);
}
