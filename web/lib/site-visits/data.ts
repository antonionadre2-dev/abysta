import "server-only";
import { notFound } from "next/navigation";
import { getDirectoryContext } from "@/lib/directory/data";
import { isUuid } from "@/lib/directory/validation";
import type { ClientRecord, SiteRecord } from "@/lib/directory/types";
import { collectVisitPages, type VisitPage } from "./pagination";
import type { RevisionSummary, SiteVisitDetail, VisitListRecord } from "./types";

function checkIds(...ids: string[]) { if (ids.some(id => !isUuid(id))) notFound(); }
function readError(error: { message: string } | null) {
  if (!error) return;
  if (["FORBIDDEN","RECORD_NOT_FOUND"].includes(error.message)) notFound();
  throw new Error("Your site visits could not be loaded. Please try again.");
}
export async function getSiteVisitContext(tenantId: string, clientId: string, siteId: string) {
  checkIds(tenantId,clientId,siteId);
  const { supabase, company, user } = await getDirectoryContext(tenantId);
  const [clientResult, siteResult, contactsResult] = await Promise.all([
    supabase.from("client_company").select("*").eq("tenant_id",tenantId).eq("id",clientId).maybeSingle(),
    supabase.from("site").select("*").eq("tenant_id",tenantId).eq("client_company_id",clientId).eq("id",siteId).maybeSingle(),
    supabase.from("client_contact").select("site_id,name,email,phone,job_title").eq("tenant_id",tenantId).eq("client_company_id",clientId).eq("site_id",siteId),
  ]);
  for (const result of [clientResult,siteResult,contactsResult]) readError(result.error);
  if (!clientResult.data || !siteResult.data) notFound();
  const contact=contactsResult.data?.[0];
  const site = {...siteResult.data,contact_name:contact?.name ?? "",contact_email:contact?.email ?? "",contact_phone:contact?.phone ?? "",contact_role:contact?.job_title ?? ""} as SiteRecord;
  return {company,client:clientResult.data as ClientRecord,site,user:{id:user.id,email:user.email}};
}
export async function getSiteVisit(tenantId:string,clientId:string,siteId:string,visitId:string,revisionNumber?:number):Promise<SiteVisitDetail> {
  checkIds(tenantId,clientId,siteId,visitId);
  if (revisionNumber!==undefined && (!Number.isSafeInteger(revisionNumber)||revisionNumber<1)) notFound();
  const {supabase}=await getDirectoryContext(tenantId);
  const {data,error}=await supabase.rpc("get_site_visit",{p_tenant_id:tenantId,p_client_id:clientId,p_site_id:siteId,p_id:visitId,p_revision_number:revisionNumber??null});
  readError(error);
  if (!data?.visit || !data?.revision) notFound();
  return data as SiteVisitDetail;
}
async function readAll<T extends {id:string}>(tenantId:string,clientId:string,siteId:string,visitId?:string):Promise<T[]> {
  checkIds(tenantId,clientId,siteId,...(visitId?[visitId]:[]));
  const {supabase}=await getDirectoryContext(tenantId);
  return collectVisitPages<T>(async(offset)=>{
    const {data,error}=await supabase.rpc(visitId?"list_visit_revisions":"list_site_visits",{
      p_tenant_id:tenantId,p_client_id:clientId,p_site_id:siteId,...(visitId?{p_id:visitId}:{}),p_offset:offset,p_limit:100,
    });
    readError(error);
    return data as VisitPage<T>;
  });
}
export function getSiteVisits(tenantId:string,clientId:string,siteId:string) { return readAll<VisitListRecord>(tenantId,clientId,siteId); }
export function getVisitRevisions(tenantId:string,clientId:string,siteId:string,visitId:string) { return readAll<RevisionSummary>(tenantId,clientId,siteId,visitId); }
