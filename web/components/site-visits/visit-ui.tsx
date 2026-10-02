import type { VisitAnswer, VisitQuestion, VisitTemplate } from "@/lib/site-visits/types";

export const visitPrimary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400";
export const visitSecondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";
export const visitPanel = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 dark:border-slate-800 dark:bg-slate-900";
export const visitInput = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export const answerSources = [
  { value: "client", label: "Client provided" }, { value: "observed", label: "Observed" },
  { value: "measured", label: "Measured" }, { value: "estimated", label: "Estimated" },
  { value: "plan", label: "Floor plan" }, { value: "document", label: "Document" },
] as const;
export const answerStates = { unanswered: "Not answered", answered: "Answered", unknown: "Unknown", not_applicable: "Not applicable" };

export function hasRecordedAnswer(question: VisitQuestion, answer?: VisitAnswer) {
  if (!answer || answer.state !== "answered" || !answer.source) return false;
  if (question.type === "boolean") return typeof answer.value === "boolean";
  if (question.type === "number") return typeof answer.value === "number" && Number.isInteger(answer.value) && answer.value >= (question.min ?? -Infinity) && answer.value <= (question.max ?? Infinity);
  if (question.type === "select") return question.options?.some((option) => option.value === answer.value) ?? false;
  return typeof answer.value === "string" && answer.value.trim().length > 0;
}

export function visitProgress(template: VisitTemplate, answers: Record<string, VisitAnswer>) {
  const required = template.questions.filter((question) => question.required);
  return {
    required: required.length,
    answered: required.filter((question) => hasRecordedAnswer(question, answers[question.id])).length,
    notApplicable: required.filter((question) => question.allow_na && answers[question.id]?.state === "not_applicable" && answers[question.id]?.note.trim()).length,
    unknown: template.questions.filter((question) => answers[question.id]?.state === "unknown").length,
    gaps: template.questions.filter((question) => answers[question.id]?.state === "unknown" || (question.required && !hasRecordedAnswer(question, answers[question.id]) && !(question.allow_na && answers[question.id]?.state === "not_applicable" && answers[question.id]?.note.trim()))),
  };
}

export function answerValue(question: VisitQuestion, answer?: VisitAnswer): string {
  if (!answer) return "Not answered";
  if (answer.state !== "answered") return answerStates[answer.state];
  if (typeof answer.value === "boolean") return answer.value ? "Yes" : "No";
  if (question.type === "select") return question.options?.find((option) => option.value === answer.value)?.label ?? String(answer.value ?? "Not answered");
  return answer.value === null ? "Not answered" : `${answer.value}${question.unit ? ` ${question.unit}` : ""}`;
}

export function VisitStatus({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === "in_progress" ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{status === "in_progress" ? "In progress" : "Draft"}</span>;
}

export function VisitLoading() {
  return <div role="status" aria-live="polite" className="space-y-6"><span className="sr-only">Loading site visits…</span><div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /><div className="h-10 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /></div>;
}

export function displayDate(date?: string | null) {
  if (!date) return "Not scheduled";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

export function displayTimestamp(date: string) {
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(date))} UTC`;
}
