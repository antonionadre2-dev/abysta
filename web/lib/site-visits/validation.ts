import { validateLayout, MAX_VISIT_PAYLOAD_BYTES } from "./layout.ts";
import rawTemplate from "./questionnaire.json" with { type: "json" };
import type { VisitActionState, VisitPayload, VisitTemplate, VisitAnswer } from "./types";

const template = rawTemplate as VisitTemplate;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const singleControl = /[\u0000-\u001f\u007f]/;
const multiControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const sources = new Set(["client", "observed", "measured", "estimated", "plan", "document"]);
const fields: Record<string, [number, number, boolean?]> = {
  title: [2,160], reference: [0,40], visit_date: [0,10], lead_name: [0,160],
  contact_name: [0,160], contact_role: [0,100], contact_email: [0,254], contact_phone: [0,60],
  notes: [0,4000,true], status: [1,30], template_key: [1,80],
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function validateVisitPayload(raw: unknown):
  | { ok: true; data: VisitPayload }
  | { ok: false; state: VisitActionState } {
  const errors: Record<string, string> = {};
  if (!object(raw) || !exactKeys(raw, [...Object.keys(fields), "answers", ...(Object.hasOwn(raw, "layout") ? ["layout"] : [])])) {
    return { ok: false, state: { error: "The visit data is invalid. Keep your entries and reload the saved visit in another tab." } };
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(raw)).length > MAX_VISIT_PAYLOAD_BYTES) return {ok:false,state:{error:"This visit is too large to save. Shorten long notes or reduce the number of zones (maximum 512,000 bytes)."}};
  } catch { return {ok:false,state:{error:"The visit data is invalid."}}; }
  const layoutResult = Object.hasOwn(raw, "layout") ? validateLayout(raw.layout) : undefined;
  if (layoutResult && !layoutResult.ok) Object.assign(errors, layoutResult.errors);
  const text: Record<string,string> = {};
  for (const [key,[min,max,multiline]] of Object.entries(fields)) {
    const value = raw[key];
    if (typeof value !== "string") { errors[key] = "Enter text in this field."; continue; }
    text[key] = value.trim();
    if ([...text[key]].length < min || [...text[key]].length > max || (multiline ? multiControl : singleControl).test(text[key])) {
      errors[key] = min ? `Use ${min}–${max} characters.` : `Use no more than ${max} characters.`;
    }
  }
  if (!["draft","in_progress"].includes(text.status)) errors.status = "Choose Draft or In progress.";
  if (text.template_key !== template.key) errors.template_key = "This questionnaire version is not supported.";
  if (text.visit_date && (!/^\d{4}-\d{2}-\d{2}$/.test(text.visit_date) || text.visit_date < "1900-01-01" || text.visit_date > "2100-12-31" || Number.isNaN(Date.parse(`${text.visit_date}T00:00:00Z`)) || new Date(`${text.visit_date}T00:00:00Z`).toISOString().slice(0,10) !== text.visit_date)) {
    errors.visit_date = "Enter a real date between 1900 and 2100.";
  }
  if (text.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.contact_email)) errors.contact_email = "Enter a valid email address.";
  if (!text.contact_name && (text.contact_email || text.contact_phone || text.contact_role)) errors.contact_name = "Add the contact’s name.";
  const answers: Record<string,VisitAnswer> = {};
  if (!object(raw.answers) || !exactKeys(raw.answers,template.questions.map(q=>q.id))) {
    errors.answers = "The questionnaire is incomplete or contains unsupported questions. Reload the saved visit in another tab.";
  } else for (const question of template.questions) {
    const entry = raw.answers[question.id];
    const key = `answer_${question.id}`;
    if (!object(entry) || !exactKeys(entry,["state","value","source","note"]) || typeof entry.state !== "string" || typeof entry.source !== "string" || typeof entry.note !== "string") {
      errors[key] = `${question.label} — check the answer.`; continue;
    }
    const state = entry.state.trim(); const source = entry.source.trim(); const note = entry.note.trim();
    const value = typeof entry.value === "string" ? entry.value.trim() : entry.value;
    if ([...note].length > 1000 || multiControl.test(note)) errors[key] = "Use no more than 1,000 characters in the answer note.";
    if (state === "unanswered") {
      if (value !== null || source !== "" || note !== "") errors[key] = "An unanswered question cannot contain a value, source or note.";
    } else if (state === "unknown" || state === "not_applicable") {
      if (value !== null || source !== "" || !note || (state === "not_applicable" && !question.allow_na)) {
        errors[key] = state === "unknown" ? "Explain what needs to be confirmed; leave the value and source empty." : "Give a reason for Not applicable where this option is available.";
      }
    } else if (state === "answered") {
      if (!sources.has(source)) errors[key] = "Choose where this answer came from.";
      if (question.type === "text" && (typeof value !== "string" || !value || [...value].length > 2000 || multiControl.test(value))) errors[key] = "Enter an answer of 1–2,000 characters.";
      if (question.type === "select" && (typeof value !== "string" || !question.options?.some(option => option.value === value))) errors[key] = "Choose one of the available options.";
      if (question.type === "boolean" && typeof value !== "boolean") errors[key] = "Choose Yes or No.";
      if (question.type === "number" && (typeof value !== "number" || !Number.isFinite(value) || (question.integer && !Number.isInteger(value)) || value < (question.min ?? -Infinity) || value > (question.max ?? Infinity))) errors[key] = `Enter a whole number from ${question.min} to ${question.max}.`;
    } else errors[key] = "Choose an answer state.";
    if (!errors[key]) answers[question.id] = { state, value, source, note } as VisitAnswer;
  }
  if (Object.keys(errors).length) return { ok:false, state: { error: "Check the highlighted fields. Your entries have not been saved.", fieldErrors: errors } };
  return { ok:true, data: { ...text, answers, ...(layoutResult?.ok ? {layout:layoutResult.data} : {}) } as VisitPayload };
}
export function validateSiteVisitForm(form: FormData):
  | { ok:true; value:{tenantId:string;clientId:string;siteId:string;id:string;expectedVersion:number;requestId:string;data:VisitPayload} }
  | { ok:false; state:VisitActionState } {
  const read = (key:string) => { const values=form.getAll(key); return values.length===1 && typeof values[0]==="string" ? values[0] : null; };
  const names=["tenant_id","client_id","site_id","id","request_id"];
  const ids=names.map(name=>read(name)?.trim().toLowerCase());
  const version=read("expected_version")?.trim(); const payload=read("payload");
  if (ids.some(id=>!id || !uuid.test(id)) || version===null || version===undefined || !/^(0|[1-9][0-9]*)$/.test(version) || (!Number.isSafeInteger(Number(version)) || Number(version)>=Number.MAX_SAFE_INTEGER) || payload===null) {
    return {ok:false,state:{error:"This form is invalid. Open the saved visit in another tab before trying again."}};
  }
  if (new TextEncoder().encode(payload).length>MAX_VISIT_PAYLOAD_BYTES) return {ok:false,state:{error:"This visit is too large to save. Shorten long notes or reduce the number of zones (maximum 512,000 bytes)."}};
  let parsed:unknown;
  try { parsed=JSON.parse(payload); } catch { return {ok:false,state:{error:"The visit could not be read. Keep your entries and try again."}}; }
  const result=validateVisitPayload(parsed); if (!result.ok) return result;
  return {ok:true,value:{tenantId:ids[0]!,clientId:ids[1]!,siteId:ids[2]!,id:ids[3]!,requestId:ids[4]!,expectedVersion:Number(version),data:result.data}};
}
