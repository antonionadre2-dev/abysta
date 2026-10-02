import type { DirectoryActionState, DirectoryKind, DirectoryPayload } from "./types";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
const BUILDING_TYPES = new Set(["office", "retail", "industrial", "residential", "education", "healthcare", "hospitality", "mixed_use", "other"]);
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function validateDirectoryForm(form: FormData):
  | { ok: true; value: { kind: DirectoryKind; tenantId: string; id: string; expectedVersion: number; requestId: string; data: DirectoryPayload } }
  | { ok: false; state: DirectoryActionState } {
  const errors: Record<string, string> = {};
  function read(name: string): string {
    const values = form.getAll(name);
    if (values.length !== 1 || typeof values[0] !== "string") {
      errors[name] = "Check this field and try again.";
      return "";
    }
    return values[0].trim();
  }
  const kind = read("kind");
  const tenantId = read("tenant_id").toLowerCase();
  const id = read("id").toLowerCase();
  const requestId = read("request_id").toLowerCase();
  const versionText = read("expected_version");
  if (!["client", "portfolio", "site"].includes(kind) || !isUuid(tenantId) || !isUuid(id) || !isUuid(requestId)
    || !/^(0|[1-9][0-9]*)$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) {
    return { ok: false, state: { error: "This form is invalid. Reload the page before trying again." } };
  }
  const data: DirectoryPayload = {};
  function field(name: string, label: string, min: number, max: number, multiline = false) {
    const value = read(name);
    data[name] = value;
    if ([...value].length < min || [...value].length > max || (multiline ? MULTI_LINE_CONTROL : SINGLE_LINE_CONTROL).test(value)) {
      errors[name] = min ? `${label} must contain ${min}–${max} characters.` : `${label} must contain no more than ${max} characters.`;
    }
    return value;
  }
  field(kind === "client" ? "legal_name" : "name", "Name", 2, 160);
  field("reference", "Reference", 0, 40);
  field("notes", "Notes", 0, 4000, true);
  const status = read("status");
  data.status = status;
  if (status !== "active" && status !== "archived") errors.status = "Choose Active or Archived.";

  if (kind !== "client") {
    data.client_company_id = read("client_company_id").toLowerCase();
    if (!isUuid(data.client_company_id)) errors.client_company_id = "Choose a valid client.";
  }
  if (kind !== "portfolio") {
    field("address", "Address", kind === "site" ? 5 : 0, 1000, true);
    const contactName = field("contact_name", "Contact name", 0, 160);
    const contactEmail = field("contact_email", "Email", 0, 254);
    const contactPhone = field("contact_phone", "Phone", 0, 60);
    const contactRole = field("contact_role", "Contact role", 0, 100);
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.contact_email = "Enter a valid email address.";
    if (!contactName && (contactEmail || contactPhone || contactRole)) errors.contact_name = "Add the contact’s name.";
  }
  if (kind === "site") {
    const timezone = field("timezone", "Time zone", 1, 128);
    try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(); }
    catch { errors.timezone = "Choose a valid time zone, such as Europe/London."; }
    const buildingType = read("building_type");
    data.building_type = buildingType;
    if (!BUILDING_TYPES.has(buildingType)) errors.building_type = "Choose a building type.";
  }
  if (kind === "portfolio") {
    const siteIds = form.getAll("site_ids").map((value) => typeof value === "string" ? value.toLowerCase() : value);
    if (siteIds.length > 5000 || siteIds.some((value) => !isUuid(value)) || new Set(siteIds).size !== siteIds.length) {
      errors.site_ids = "Choose each building once, with no more than 5,000 buildings per save.";
    }
    data.site_ids = siteIds.filter((value): value is string => typeof value === "string");
  }
  if (Object.keys(errors).length) return { ok: false, state: { error: "Check the highlighted fields.", fieldErrors: errors } };
  return { ok: true, value: { kind: kind as DirectoryKind, tenantId, id, expectedVersion: Number(versionText), requestId, data } };
}
