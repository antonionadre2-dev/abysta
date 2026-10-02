"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Save } from "lucide-react";
import { saveDirectoryAction } from "@/lib/directory/actions";
import type { ClientRecord, DirectoryActionState, DirectoryKind, PortfolioRecord, SiteRecord } from "@/lib/directory/types";
import { panelClasses, primaryLink, secondaryLink } from "./directory-ui";

type RecordData = ClientRecord | PortfolioRecord | SiteRecord;
type Props = { kind: DirectoryKind; tenantId: string; clientId?: string; record?: RecordData | null; sites?: SiteRecord[]; selectedSiteIds?: string[]; initialId: string; initialRequestId: string; cancelHref: string; timezone?: string };
const inputClasses = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const buildingTypes = ["office", "retail", "industrial", "residential", "education", "healthcare", "hospitality", "mixed_use", "other"];
const humanise = (text: string) => text.replaceAll("_", " ");

function valuesFor(kind: DirectoryKind, record: RecordData | null | undefined, timezone: string): Record<string, string> {
  const values: Record<string, string> = { reference: "", notes: "", status: "active" };
  if (kind === "client") Object.assign(values, { legal_name: "", address: "" });
  else values.name = "";
  if (kind === "site") Object.assign(values, { address: "", timezone, building_type: "office" });
  if (kind !== "portfolio") Object.assign(values, { contact_name: "", contact_email: "", contact_phone: "", contact_role: "" });
  if (record) for (const key of Object.keys(values)) {
    const entry = Object.entries(record).find(([name]) => name === key)?.[1];
    if (typeof entry === "string") values[key] = entry;
  }
  return values;
}

export function DirectoryForm({ kind, tenantId, clientId, record, sites = [], selectedSiteIds = [], initialId, initialRequestId, cancelHref, timezone = "Europe/London" }: Props) {
  const [state, formAction, pending] = useActionState(saveDirectoryAction, {} as DirectoryActionState);
  const [initialValues] = useState(() => valuesFor(kind, record, timezone));
  const [values, setValues] = useState(initialValues);
  const [initialSelection] = useState(selectedSiteIds);
  const [selected, setSelected] = useState(initialSelection);
  // Preserve the version belonging to the initial editable values, even if a
  // background refresh delivers newer server props while this draft is open.
  const [expectedVersion] = useState(record?.row_version ?? 0);
  const discarding = useRef(false);
  const [requestId] = useState(initialRequestId);
  const [recordId] = useState(record?.id ?? initialId);
  const [buildingQuery, setBuildingQuery] = useState("");
  const [buildingPage, setBuildingPage] = useState(1);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues) || [...selected].sort().join() !== [...initialSelection].sort().join();
  const errors = Object.entries(state.fieldErrors ?? {}).filter(([, value]) => Boolean(value));
  const hasErrors = Boolean(state.error || errors.length);

  useEffect(() => { if (hasErrors && !pending) errorRef.current?.focus(); }, [state, pending, hasErrors]);
  useEffect(() => {
    if (!dirty || pending) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (discarding.current) return; event.preventDefault(); event.returnValue = ""; };
    const confirmLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", confirmLink, true); };
  }, [dirty, pending]);

  function update(name: string, value: string) { setValues((current) => ({ ...current, [name]: value })); }
  function field(name: string, label: string, options: { required?: boolean; multiline?: boolean; type?: string; hint?: string } = {}) {
    const shared = { id: name, name, required: options.required, value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(name, event.target.value), "aria-invalid": Boolean(state.fieldErrors?.[name]), "aria-describedby": [options.hint ? `${name}-help` : "", state.fieldErrors?.[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined, className: inputClasses };
    return <div className="space-y-2"><label htmlFor={name} className="block text-sm font-semibold">{label}{options.required ? <span className="font-normal text-slate-500"> (required)</span> : <span className="font-normal text-slate-400"> (optional)</span>}</label>{options.multiline ? <textarea {...shared} rows={name === "notes" ? 5 : 3} /> : <input {...shared} type={options.type ?? "text"} />}{options.hint && <p id={`${name}-help`} className="text-xs leading-5 text-slate-500 dark:text-slate-400">{options.hint}</p>}{state.fieldErrors?.[name] && <p id={`${name}-error`} className="text-sm text-red-700 dark:text-red-300">{state.fieldErrors[name]}</p>}</div>;
  }

  const eligibleSites = sites.filter((site) => site.status === "active" || initialSelection.includes(site.id));
  const matchingSites = eligibleSites.filter((site) => `${site.name} ${site.reference} ${site.address}`.toLocaleLowerCase().includes(buildingQuery.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(matchingSites.length / 20));
  const page = Math.min(buildingPage, pages);
  const recordLabel = kind === "site" ? "building" : kind;

  return <form action={formAction} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
    if (record && values.status === "archived" && record.status !== "archived" && !window.confirm(kind === "client" ? "Archive this client? Its buildings and portfolios will remain saved, but you must restore the client before editing them." : `Archive this ${recordLabel}? It will remain available in archived records.`)) event.preventDefault();
  }}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="tenant_id" value={tenantId} /><input type="hidden" name="id" value={recordId} /><input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="expected_version" value={expectedVersion} />{kind !== "client" && <input type="hidden" name="client_company_id" value={clientId ?? ""} />}
    {selected.map((id) => <input key={id} type="hidden" name="site_ids" value={id} />)}
    {hasErrors && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><p className="font-semibold">{state.error || "Check the highlighted details."}</p>{errors.length > 0 && <ul className="mt-3 space-y-1">{errors.map(([name, value]) => <li key={name}><a href={`#${name}`} className="underline underline-offset-2">{value}</a></li>)}</ul>}{state.conflict && <div className="mt-4 space-y-3"><p>Your entries are still in this form. Review the current saved record in a new tab before replacing them.</p><a target="_blank" rel="noopener" href={cancelHref} className="inline-block font-semibold underline underline-offset-4">Open saved record in a new tab</a><div><button type="button" onClick={() => { if (window.confirm("Reload the latest record? This will discard the unsaved entries in this form.")) { discarding.current = true; window.location.reload(); } }} className={secondaryLink}>Discard entries and reload</button></div></div>}</div>}
    <fieldset disabled={pending || Boolean(state.conflict)} className="space-y-6">
      <legend className="sr-only">{record ? "Edit" : "New"} {recordLabel}</legend>
      <section className={panelClasses} aria-labelledby="record-details-heading"><h2 id="record-details-heading" className="text-lg font-semibold">{kind === "client" ? "Client details" : kind === "portfolio" ? "Portfolio details" : "Building details"}</h2><p className="mb-6 mt-2 text-sm text-slate-500 dark:text-slate-400">{kind === "portfolio" ? "Group buildings for this client. Each building keeps its own details." : "Keep the details your team needs in one place."}</p><div className="space-y-6">{field(kind === "client" ? "legal_name" : "name", kind === "client" ? "Client company name" : kind === "site" ? "Building name" : "Portfolio name", { required: true, hint: "Use 2–160 characters." })}{field("reference", "Reference", { hint: "An internal code, up to 40 characters. Leave empty if you do not use one." })}{kind !== "portfolio" && field("address", kind === "site" ? "Building address" : "Client address", { multiline: true, required: kind === "site", hint: "Include the street, town or city, postcode and country." })}{kind === "site" && <div className="grid gap-6 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="building_type" className="block text-sm font-semibold">Building type</label><select id="building_type" name="building_type" value={values.building_type} onChange={(event) => update("building_type", event.target.value)} className={`${inputClasses} capitalize`} aria-invalid={Boolean(state.fieldErrors?.building_type)}>{buildingTypes.map((type) => <option value={type} key={type}>{humanise(type)}</option>)}</select></div>{field("timezone", "Time zone", { required: true, hint: "For example Europe/London or Europe/Zurich." })}</div>}</div></section>
      {kind !== "portfolio" && <section className={panelClasses} aria-labelledby="contact-heading"><h2 id="contact-heading" className="text-lg font-semibold">{kind === "site" ? "Building contact" : "Primary contact"}</h2><p className="mb-6 mt-2 text-sm text-slate-500 dark:text-slate-400">Add a contact name if you enter any contact details.</p><div className="grid gap-6 sm:grid-cols-2">{field("contact_name", "Contact name")}{field("contact_role", "Job title")}{field("contact_email", "Email", { type: "email" })}{field("contact_phone", "Phone", { type: "tel" })}</div></section>}
      {kind === "portfolio" && <section id="site_ids" className={panelClasses} aria-labelledby="portfolio-buildings-heading"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="portfolio-buildings-heading" className="text-lg font-semibold">Buildings in this portfolio</h2><p role="status" className="mt-2 text-sm text-teal-700 dark:text-teal-300">{selected.length} selected across all pages</p></div><button type="button" disabled={selected.length === 0} onClick={() => setSelected([])} className={`${secondaryLink} disabled:opacity-40`}>Clear selection</button></div><p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">Select buildings belonging to this client. You can save an empty portfolio and add buildings later. Archived buildings already linked can be retained or removed.</p><label htmlFor="building-search" className="mb-2 mt-5 block text-sm font-semibold">Find a building</label><input id="building-search" type="search" value={buildingQuery} onChange={(event) => { setBuildingQuery(event.target.value); setBuildingPage(1); }} className={inputClasses} placeholder="Search name, reference or address" />{state.fieldErrors?.site_ids && <p className="mt-2 text-sm text-red-700">{state.fieldErrors.site_ids}</p>}<div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{matchingSites.slice((page - 1) * 20, page * 20).map((site) => <label key={site.id} className="flex cursor-pointer items-start gap-3 py-4"><input type="checkbox" checked={selected.includes(site.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, site.id] : current.filter((id) => id !== site.id))} className="mt-1 size-5 shrink-0 accent-teal-700" /><span className="min-w-0"><span className="block break-words text-sm font-semibold">{site.name}{site.status === "archived" && <span className="ml-2 font-normal text-slate-500">Archived</span>}</span><span className="mt-1 block break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{[site.reference, site.address].filter(Boolean).join(" · ")}</span></span></label>)}{matchingSites.length === 0 && <p className="py-6 text-sm text-slate-500">{eligibleSites.length ? "No buildings match this search." : "No buildings available yet. Save this portfolio, then add buildings from the client page."}</p>}</div>{pages > 1 && <div className="mt-3 flex items-center justify-between gap-3"><button type="button" disabled={page === 1} onClick={() => setBuildingPage(page - 1)} className={`${secondaryLink} disabled:opacity-40`}>Previous</button><span className="text-xs">{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => setBuildingPage(page + 1)} className={`${secondaryLink} disabled:opacity-40`}>Next</button></div>}</section>}
      <section className={panelClasses}>{field("notes", "Internal notes", { multiline: true, hint: "Up to 4,000 characters. Visible to authorised company owners in this release." })}{record ? <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800"><label htmlFor="status" className="mb-2 block text-sm font-semibold">Record status</label><select id="status" name="status" value={values.status} onChange={(event) => update("status", event.target.value)} className={inputClasses}><option value="active">Active</option><option value="archived">Archived</option></select><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Choose Archived to keep the record out of active lists. Choose Active to restore it. Changes apply when you save.</p></div> : <input type="hidden" name="status" value="active" />}</section>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p role="status" className="text-xs text-slate-500 dark:text-slate-400">{pending ? "Saving your changes…" : dirty ? "You have unsaved changes." : "Changes are saved when you select Save."}</p><div className="flex flex-wrap gap-3"><Link href={cancelHref} aria-disabled={pending} onClick={(event) => { if (pending) event.preventDefault(); }} className={`${secondaryLink} ${pending ? "pointer-events-none opacity-50" : ""}`}>Cancel</Link><button type="submit" disabled={pending || Boolean(state.conflict)} className={`${primaryLink} disabled:cursor-not-allowed disabled:opacity-50`}>{pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Save className="size-4" aria-hidden="true" />}{pending ? "Saving…" : `Save ${recordLabel}`}</button></div></div>
  </form>;
}
