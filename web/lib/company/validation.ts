import type { CompanyActionState, CompanyValues } from "./types";

const currencies = new Set(["GBP", "CHF", "EUR", "USD"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read only the four fields this operation accepts. Never accept a user id,
// company id or role from the browser, including hidden fields.
export function validateCompanyForm(form: FormData):
  | { ok: true; values: CompanyValues }
  | { ok: false; state: CompanyActionState } {
  const field = (name: string) => {
    const values = form.getAll(name);
    return values.length === 1 && typeof values[0] === "string"
      ? values[0]
      : "";
  };
  const values: CompanyValues = {
    name: field("name").trim(),
    currency: field("currency"),
    timezone: field("timezone"),
    requestId: field("requestId"),
  };
  const fieldErrors: NonNullable<CompanyActionState["fieldErrors"]> = {};
  const length = Array.from(values.name).length;

  if (length < 2 || length > 120 || /[\u0000-\u001f\u007f]/.test(values.name)) {
    fieldErrors.name = "Enter a company name between 2 and 120 characters, on one line.";
  }
  if (!currencies.has(values.currency)) {
    fieldErrors.currency = "Choose a currency from the list.";
  }
  try {
    if (!values.timezone || values.timezone.length > 128) throw new Error();
    new Intl.DateTimeFormat("en-GB", { timeZone: values.timezone });
  } catch {
    fieldErrors.timezone = "Choose a valid time zone.";
  }

  if (!uuid.test(values.requestId)) {
    return {
      ok: false,
      state: { error: "This form has expired. Reload the page and try again.", values },
    };
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, state: { error: "Check the highlighted fields.", fieldErrors, values } };
  }
  return { ok: true, values };
}
