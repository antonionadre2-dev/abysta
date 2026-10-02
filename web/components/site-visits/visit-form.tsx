"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ClipboardCheck, LoaderCircle, Save, Wifi, WifiOff } from "lucide-react";
import { saveSiteVisitAction } from "@/lib/site-visits/actions";
import { emptyAnswers, visitTemplate } from "@/lib/site-visits/questionnaire";
import type { SiteRecord } from "@/lib/directory/types";
import type { AnswerSource, AnswerState, SiteVisitDetail, VisitActionState, VisitAnswer, VisitPayload, VisitQuestion, VisitStatus } from "@/lib/site-visits/types";
import { answerSources, answerStates, hasRecordedAnswer, visitInput, visitPanel, visitPrimary, visitProgress, visitSecondary } from "./visit-ui";

type Props = { tenantId: string; clientId: string; site: SiteRecord; detail?: SiteVisitDetail; initialId: string; initialRequestId: string; cancelHref: string };
type TextField = Exclude<keyof VisitPayload, "answers" | "status" | "template_key">;

function initialValues(site: SiteRecord, detail?: SiteVisitDetail): VisitPayload {
  const revision = detail?.revision;
  return {
    title: revision?.title ?? "Initial site visit", reference: revision?.reference ?? "", visit_date: revision?.visit_date ?? "", lead_name: revision?.lead_name ?? "",
    contact_name: revision?.contact_name ?? site.contact_name, contact_role: revision?.contact_role ?? site.contact_role,
    contact_email: revision?.contact_email ?? site.contact_email, contact_phone: revision?.contact_phone ?? site.contact_phone,
    notes: revision?.notes ?? "", status: revision?.status ?? "draft", template_key: revision?.template_key ?? visitTemplate.key,
    answers: revision?.answers ?? emptyAnswers(),
  };
}

export function VisitForm({ tenantId, clientId, site, detail, initialId, initialRequestId, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(saveSiteVisitAction, {} as VisitActionState);
  // The token and template belong to these exact initial inputs. A background
  // server refresh must never silently grant an old draft a newer row version.
  const [initial] = useState(() => initialValues(site, detail));
  const [values, setValues] = useState(initial);
  const [template] = useState(detail?.revision.template_snapshot ?? visitTemplate);
  const [expectedVersion] = useState(detail?.visit.row_version ?? 0);
  const [requestId] = useState(initialRequestId);
  const [recordId] = useState(detail?.visit.id ?? initialId);
  const [online, setOnline] = useState(true);
  const discarding = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const savedHref = `/protected/workspaces/${tenantId}/clients/${clientId}/buildings/${site.id}/visits/${recordId}`;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const progress = visitProgress(template, values.answers);
  const errors = Object.entries(state.fieldErrors ?? {}).filter(([, message]) => Boolean(message));
  const hasErrors = Boolean(state.error || errors.length);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => { if (hasErrors && !pending) errorRef.current?.focus(); }, [hasErrors, pending, state]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (discarding.current) return; event.preventDefault(); event.returnValue = ""; };
    const confirmLink = (event: MouseEvent) => {
      if (discarding.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.getAttribute("href")?.startsWith("#")) return;
      if (pending || !window.confirm("You have unsaved changes. Leave this page and discard them?")) { event.preventDefault(); event.stopPropagation(); }
    };
    // Navigation API covers browser back/forward in supporting browsers; normal
    // document exits also retain the beforeunload guard, including during saves.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const confirmTraverse = (event: Event) => {
      if ((event as Event & { navigationType?: string }).navigationType !== "traverse" || !event.cancelable || discarding.current) return;
      if (pending || !window.confirm("You have unsaved changes. Leave this page and discard them?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmLink, true);
    navigation?.addEventListener("navigate", confirmTraverse);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", confirmLink, true); navigation?.removeEventListener("navigate", confirmTraverse); };
  }, [dirty, pending]);

  function changeField(name: TextField, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  function changeAnswer(id: string, changes: Partial<VisitAnswer>) { setValues((current) => ({ ...current, answers: { ...current.answers, [id]: { ...current.answers[id], ...changes } } })); }
  function changeAnswerState(id: string, answerState: AnswerState) {
    const answer = values.answers[id];
    if (answerState !== answer.state && (answer.value !== null && answer.value !== "" || answer.source || answer.note) && !window.confirm("Change the answer status? The existing response, source and note for this question will be cleared.")) return;
    changeAnswer(id, { state: answerState, value: null, source: "", note: "" });
  }
  function revealQuestion(fieldName: string) {
    const element = document.getElementById(fieldName);
    const accordion = element?.closest("details");
    if (accordion) accordion.open = true;
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function field(name: TextField, label: string, options: { required?: boolean; type?: string; hint?: string; max?: number; multiline?: boolean } = {}) {
    const error = state.fieldErrors?.[name];
    const common = { id: name, value: values[name], maxLength: options.max, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => changeField(name, event.target.value), "aria-invalid": Boolean(error), "aria-describedby": [options.hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ") || undefined, className: visitInput };
    return <div className="min-w-0 space-y-2"><label htmlFor={name} className="block text-sm font-semibold">{label}<span className="font-normal text-slate-500"> ({options.required ? "required" : "optional"})</span></label>{options.multiline ? <textarea {...common} rows={5} /> : <input {...common} type={options.type ?? "text"} min={options.type === "date" ? "1900-01-01" : undefined} max={options.type === "date" ? "2100-12-31" : undefined} />}{options.hint && <p id={`${name}-hint`} className="text-xs leading-5 text-slate-500 dark:text-slate-400">{options.hint}</p>}{error && <p id={`${name}-error`} className="text-sm text-red-700 dark:text-red-300">{error}</p>}</div>;
  }

  return <form action={formAction} noValidate aria-busy={pending} className="space-y-6" onSubmit={(event) => { if (!online || pending || state.conflict) event.preventDefault(); }}>
    <input type="hidden" name="tenant_id" value={tenantId} /><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="site_id" value={site.id} /><input type="hidden" name="id" value={recordId} /><input type="hidden" name="expected_version" value={expectedVersion} /><input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="payload" value={JSON.stringify(values)} />
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-xs leading-5 ${online ? "border-blue-100 bg-blue-50/60 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`} role="status">{online ? <Wifi className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}<p>{online ? "Save manually when you are ready. Each save creates a revision. This form requires an internet connection; changes are not stored offline." : "You appear to be offline. Keep this page open to retain your entries, then reconnect before saving. There is no background sync or offline storage."}</p></div>
    {hasErrors && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><p className="font-semibold">{state.error || "Check the highlighted details."}</p>{errors.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5">{errors.map(([name, message]) => <li key={name}><a href={`#${name}`} onClick={() => revealQuestion(name)} className="underline underline-offset-2">{message}</a></li>)}</ul>}<p className="mt-3">Your entries remain in this form. If your session expired, <a href="/auth/login" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">sign in in a new tab</a>, then return here.</p>{state.conflict && <div className="mt-4 space-y-3 border-t border-red-200 pt-4 dark:border-red-800"><p>Saving is paused to protect the current record. Review the saved version before discarding your entries.</p><a href={savedHref} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Open saved visit in a new tab</a><div><button type="button" className={visitSecondary} onClick={() => { if (window.confirm("Discard your entries and open the saved visit?")) { discarding.current = true; window.location.assign(savedHref); } }}>Discard entries and open saved visit</button></div></div>}</div>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
      <fieldset disabled={pending || Boolean(state.conflict)} className="min-w-0 space-y-6"><legend className="sr-only">Site visit questionnaire</legend>
        <section className={visitPanel} aria-labelledby="visit-basics"><h2 id="visit-basics" className="text-lg font-semibold">Visit details</h2><p className="mb-6 mt-2 text-sm leading-6 text-slate-500">Give this visit a clear name. Dates and contacts can be added later.</p><div className="space-y-6">{field("title", "Visit title", { required: true, max: 160 })}<div className="grid gap-6 sm:grid-cols-2">{field("reference", "Reference", { max: 40 })}{field("visit_date", "Visit date", { type: "date" })}</div>{field("lead_name", "Visit lead", { max: 160, hint: "The person carrying out the visit. This name does not assign access or permissions." })}<div className="space-y-2"><label htmlFor="status" className="block text-sm font-semibold">Working status</label><select id="status" value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value as VisitStatus }))} className={visitInput}><option value="draft">Draft</option><option value="in_progress">In progress</option></select><p className="text-xs leading-5 text-slate-500">Both statuses can contain missing information. Neither means the survey is approved or complete.</p></div></div></section>
        <details className={visitPanel}><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold">Visit contact<ChevronDown className="size-5 shrink-0 text-slate-400" aria-hidden="true" /></summary><p className="mb-5 mt-2 text-sm leading-6 text-slate-500">Initially copied from the building. Edits apply only to this visit. Add a name if you enter any contact details.</p><div className="grid gap-6 sm:grid-cols-2">{field("contact_name", "Contact name", { max: 160 })}{field("contact_role", "Job title", { max: 100 })}{field("contact_email", "Email", { type: "email", max: 254 })}{field("contact_phone", "Phone", { type: "tel", max: 60 })}</div></details>
        <div id="answers" className="space-y-4"><div className="px-1"><h2 className="text-lg font-semibold">Survey questionnaire</h2><p className="mt-2 text-sm leading-6 text-slate-500">{template.title}. Record what you know and explain any gaps. Required questions may be left unanswered when saving a draft.</p></div>{template.sections.map((section, index) => {
          const questions = template.questions.filter((question) => question.section === section.id);
          const answered = questions.filter((question) => hasRecordedAnswer(question, values.answers[question.id])).length;
          return <details key={section.id} open={index === 0 ? true : undefined} className={visitPanel}><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-300">Section {index + 1}</p><h3 className="mt-2 break-words text-lg font-semibold">{section.title}</h3><p className="mt-2 text-xs text-slate-500">{answered} of {questions.length} answers recorded</p></div><ChevronDown className="size-5 shrink-0 text-slate-400" aria-hidden="true" /></summary><p className="mb-6 mt-3 text-sm leading-6 text-slate-500">{section.description}</p><div className="divide-y divide-slate-100 dark:divide-slate-800">{questions.map((question) => <QuestionField key={question.id} question={question} answer={values.answers[question.id]} error={state.fieldErrors?.[`answer_${question.id}`]} onChange={(changes) => changeAnswer(question.id, changes)} onStateChange={(answerState) => changeAnswerState(question.id, answerState)} />)}</div></details>;
        })}</div>
        <section className={visitPanel}>{field("notes", "Additional visit notes", { multiline: true, max: 4000, hint: "Internal context for this visit, up to 4,000 characters. Visible to authorised company owners in this release." })}</section>
      </fieldset>
      <aside className="space-y-4 xl:sticky xl:top-6"><section className={visitPanel} aria-labelledby="survey-progress"><ClipboardCheck className="size-6 text-blue-700 dark:text-blue-300" aria-hidden="true" /><h2 id="survey-progress" className="mt-4 font-semibold">Information captured</h2><p className="mt-4 text-3xl font-semibold tracking-tight">{progress.answered}<span className="text-lg font-normal text-slate-400"> / {progress.required}</span></p><p className="mt-2 text-xs leading-5 text-slate-500">Required questions with a response and source.</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Required questions answered" aria-valuenow={progress.answered} aria-valuemin={0} aria-valuemax={progress.required}><div className="h-full rounded-full bg-blue-600" style={{ width: `${progress.required ? 100 * progress.answered / progress.required : 0}%` }} /></div><dl className="mt-5 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt>Required, marked not applicable</dt><dd className="font-semibold">{progress.notApplicable}</dd></div><div className="flex justify-between gap-3"><dt>Unknown answers</dt><dd className="font-semibold">{progress.unknown}</dd></div></dl><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500 dark:border-slate-800">This tracks answers, not inspection quality or approval.</p></section><section className={visitPanel} aria-labelledby="follow-up-heading"><div className="flex items-center gap-2"><AlertCircle className="size-4 text-amber-600" aria-hidden="true" /><h2 id="follow-up-heading" className="font-semibold">To follow up</h2></div><p role="status" className="mt-2 text-xs leading-5 text-slate-500">{progress.gaps.length} required gaps or unknown answers</p>{progress.gaps.length ? <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{progress.gaps.map((question) => <li key={question.id} className="py-2"><a href={`#answer_${question.id}`} onClick={() => revealQuestion(`answer_${question.id}`)} className="inline-block py-1 text-xs leading-5 text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">{question.label}</a><p className="text-xs text-slate-400">{answerStates[values.answers[question.id]?.state ?? "unanswered"]}</p></li>)}</ul> : <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">No required gaps or unknowns recorded. Review your notes before the next stage.</p>}</section></aside>
    </div>
    <div className="z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur xl:sticky xl:bottom-3 dark:border-slate-700 dark:bg-slate-900/95"><p role="status" aria-live="polite" className="max-w-lg text-xs leading-5 text-slate-500 dark:text-slate-400">{pending ? "Saving your visit… Keep this page open." : state.conflict ? "Review the conflict before continuing." : dirty ? "You have unsaved changes." : detail ? `Editing saved revision ${expectedVersion}. A save creates a new revision.` : "This visit has not been saved yet."}</p><div className="flex flex-wrap gap-3"><Link href={cancelHref} aria-disabled={pending} onClick={(event) => { if (pending) event.preventDefault(); }} className={`${visitSecondary} ${pending ? "pointer-events-none opacity-50" : ""}`}>Cancel</Link><button type="submit" disabled={pending || !online || Boolean(state.conflict)} className={visitPrimary}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{pending ? "Saving…" : "Save draft"}</button></div></div>
  </form>;
}

function QuestionField({ question, answer, error, onChange, onStateChange }: { question: VisitQuestion; answer: VisitAnswer; error?: string; onChange: (changes: Partial<VisitAnswer>) => void; onStateChange: (state: AnswerState) => void }) {
  const id = `answer_${question.id}`;
  const common = { id: `${id}-value`, "aria-labelledby": `${id}-label`, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined, className: visitInput };
  return <div id={id} className="scroll-mt-8 space-y-4 py-6 first:pt-0 last:pb-0"><div><p id={`${id}-label`} className="text-sm font-semibold leading-6">{question.label}</p><p className="mt-1 text-xs text-slate-400">{question.required ? "Required for the survey" : "Optional"}</p></div><div className="space-y-2"><label htmlFor={`${id}-state`} className="block text-xs font-semibold">Answer status</label><select id={`${id}-state`} value={answer.state} onChange={(event) => onStateChange(event.target.value as AnswerState)} className={visitInput}><option value="unanswered">Not answered yet</option><option value="answered">Add an answer</option><option value="unknown">Unknown — needs confirmation</option>{question.allow_na && <option value="not_applicable">Not applicable</option>}</select></div>
    {answer.state === "answered" && <><div className="space-y-2">{question.type === "text" ? <textarea {...common} rows={3} maxLength={2000} value={typeof answer.value === "string" ? answer.value : ""} onChange={(event) => onChange({ value: event.target.value })} placeholder="Record the response" /> : question.type === "number" ? <><input {...common} type="number" inputMode="numeric" step="1" min={question.min} max={question.max} value={typeof answer.value === "number" ? answer.value : ""} onChange={(event) => onChange({ value: event.target.value === "" ? null : event.target.valueAsNumber })} /><p className="text-xs text-slate-500">{question.unit} · whole numbers {question.min}–{question.max}. Enter 0 only when zero is confirmed.</p></> : question.type === "boolean" ? <select {...common} value={typeof answer.value === "boolean" ? String(answer.value) : ""} onChange={(event) => onChange({ value: event.target.value === "" ? null : event.target.value === "true" })}><option value="">Choose Yes or No</option><option value="true">Yes</option><option value="false">No</option></select> : <select {...common} value={typeof answer.value === "string" ? answer.value : ""} onChange={(event) => onChange({ value: event.target.value })}><option value="">Choose an answer</option>{question.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</div><div className="space-y-2"><label htmlFor={`${id}-source`} className="block text-xs font-semibold">Source of this answer (required)</label><select id={`${id}-source`} value={answer.source} onChange={(event) => onChange({ source: event.target.value as AnswerSource })} className={visitInput}><option value="">Choose a source</option>{answerSources.map((source) => <option value={source.value} key={source.value}>{source.label}</option>)}</select></div></>}
    {answer.state !== "unanswered" && <div className="space-y-2"><label htmlFor={`${id}-note`} className="block text-xs font-semibold">{answer.state === "unknown" ? "What needs confirming, and with whom? (required)" : answer.state === "not_applicable" ? "Why is this not applicable? (required)" : "Supporting note (optional)"}</label><textarea id={`${id}-note`} rows={2} maxLength={1000} value={answer.note} onChange={(event) => onChange({ note: event.target.value })} className={visitInput} /><p className="text-xs leading-5 text-slate-500">{answer.state === "unknown" ? "This stays on the follow-up list. Unknown is never treated as zero or No." : answer.state === "not_applicable" ? "A reason is saved with the revision. This is separate from an answered question." : "Add any assumptions or context that explain this response."}</p></div>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
  </div>;
}
