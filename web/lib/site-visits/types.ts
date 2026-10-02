export type VisitStatus = "draft" | "in_progress";
export type AnswerState = "unanswered" | "answered" | "unknown" | "not_applicable";
export type AnswerSource = "" | "client" | "observed" | "measured" | "estimated" | "plan" | "document";
export type VisitAnswer = { state: AnswerState; value: string | number | boolean | null; source: AnswerSource; note: string };
export type VisitQuestion = {
  id: string; section: string; label: string; type: "text" | "select" | "number" | "boolean";
  required: boolean; allow_na: boolean; options?: { value: string; label: string }[];
  unit?: string; min?: number; max?: number; integer?: boolean;
};
export type VisitTemplate = {
  key: string; version: number; title: string;
  sections: { id: string; title: string; description: string }[];
  questions: VisitQuestion[];
};
export type VisitPayload = {
  title: string; reference: string; visit_date: string; lead_name: string;
  contact_name: string; contact_role: string; contact_email: string; contact_phone: string;
  notes: string; status: VisitStatus; template_key: string; answers: Record<string, VisitAnswer>;
};
export type SiteVisitRecord = {
  tenant_id: string; id: string; client_company_id: string; site_id: string;
  row_version: number; current_revision_id: string; created_by: string; updated_by: string;
  created_at: string; updated_at: string;
};
export type VisitRevision = Omit<VisitPayload, "visit_date"> & {
  tenant_id: string; id: string; site_visit_id: string; client_company_id: string; site_id: string;
  revision_number: number; visit_date: string | null; template_snapshot: VisitTemplate;
  site_snapshot: { id: string; name: string; reference: string; address: string; timezone: string; building_type: string };
  client_snapshot: { id: string; legal_name: string; reference: string; address: string };
  created_by: string; created_at: string;
};
export type SiteVisitDetail = { visit: SiteVisitRecord; revision: VisitRevision };
export type VisitListRecord = SiteVisitRecord & Pick<VisitRevision, "title" | "reference" | "visit_date" | "lead_name" | "status">;
export type RevisionSummary = Pick<VisitRevision, "id" | "revision_number" | "title" | "status" | "created_by" | "created_at">;
export type VisitActionState = { error?: string; fieldErrors?: Record<string, string>; conflict?: boolean };
