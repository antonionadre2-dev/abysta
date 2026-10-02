import rawTemplate from "./questionnaire.json" with { type: "json" };
import type { VisitAnswer, VisitTemplate, VisitQuestion } from "./types";

export const visitTemplate = rawTemplate as VisitTemplate;
export function emptyAnswers(template: VisitTemplate = visitTemplate): Record<string, VisitAnswer> {
  return Object.fromEntries(template.questions.map((question) => [question.id, { state: "unanswered", value: null, source: "", note: "" }]));
}
export function isResolvedAnswer(question: VisitQuestion, answer?: VisitAnswer) {
  if (!answer) return false;
  if (answer.state === "not_applicable") return question.allow_na && answer.value === null && !answer.source && Boolean(answer.note.trim());
  if (answer.state !== "answered" || !["client", "observed", "measured", "estimated", "plan", "document"].includes(answer.source)) return false;
  const value=answer.value;
  if (question.type === "text") return typeof value === "string" && Boolean(value.trim()) && [...value.trim()].length<=2000;
  if (question.type === "boolean") return typeof value === "boolean";
  if (question.type === "select") return question.options?.some(option=>option.value===value) ?? false;
  return typeof value === "number" && Number.isFinite(value) && (!question.integer || Number.isInteger(value)) && value >= (question.min ?? -Infinity) && value <= (question.max ?? Infinity);
}
export function visitProgress(answers: Record<string, VisitAnswer>, template: VisitTemplate = visitTemplate) {
  const required = template.questions.filter((question) => question.required);
  const resolved = (question: VisitQuestion) => isResolvedAnswer(question, answers[question.id]);
  const complete = required.filter((question) => resolved(question)).length;
  const pending = template.questions.filter((question) => answers[question.id]?.state === "unknown" || (question.required && !resolved(question)));
  return { complete, total: required.length, pending };
}
