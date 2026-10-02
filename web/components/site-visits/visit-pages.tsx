import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, ClipboardList, History, LockKeyhole, Pencil, Plus } from "lucide-react";
import { getSiteInventory, getSiteVisit, getSiteVisitContext, getSiteVisits, getVisitRevisions } from "@/lib/site-visits/data";
import { isUuid } from "@/lib/directory/validation";
import type { SiteVisitDetail } from "@/lib/site-visits/types";
import { DetailField, DirectoryBreadcrumbs } from "@/components/directory/directory-ui";
import { VisitForm } from "./visit-form";
import { LayoutSnapshot } from "./visit-layout";
import { RevisionList, VisitList } from "./visit-list";
import { answerSources, answerValue, displayDate, displayTimestamp, VisitStatus, visitPanel, visitPrimary, visitProgress, visitSecondary } from "./visit-ui";

type Params = { tenantId: string; clientId: string; siteId: string; visitId?: string; revisionNumber?: string };
type Screen = "list" | "new" | "detail" | "edit" | "revision";

export async function VisitScreen({ params, screen }: { params: Promise<Params>; screen: Screen }) {
  const raw = await params;
  if ([raw.tenantId, raw.clientId, raw.siteId, ...(raw.visitId ? [raw.visitId] : [])].some((id) => !isUuid(id))) notFound();
  const tenantId = raw.tenantId.toLowerCase(), clientId = raw.clientId.toLowerCase(), siteId = raw.siteId.toLowerCase(), visitId = raw.visitId?.toLowerCase();
  const revisionNumber = raw.revisionNumber === undefined ? undefined : Number(raw.revisionNumber);
  if (raw.revisionNumber !== undefined && (!/^[1-9]\d*$/.test(raw.revisionNumber) || !Number.isSafeInteger(revisionNumber))) notFound();
  if ((screen === "detail" || screen === "edit" || screen === "revision") && !visitId) notFound();
  if (screen === "revision" && revisionNumber === undefined) notFound();
  const { company, client, site } = await getSiteVisitContext(tenantId, clientId, siteId);
  const detail = visitId ? await getSiteVisit(tenantId, clientId, siteId, visitId, screen === "revision" ? revisionNumber : undefined) : undefined;
  const clientBase = `/protected/workspaces/${tenantId}/clients/${clientId}`;
  const buildingBase = `${clientBase}/buildings/${siteId}`;
  const base = `${buildingBase}/visits`;
  const recordBase = `${base}/${visitId}`;
  const editable = client.status === "active" && site.status === "active";
  const breadcrumbs: { label: string; href?: string }[] = [
    { label: company.name, href: "/protected" }, { label: "Clients", href: `/protected/workspaces/${tenantId}/clients` },
    { label: detail?.revision.client_snapshot.legal_name ?? client.legal_name, href: clientBase },
    { label: detail?.revision.site_snapshot.name ?? site.name, href: buildingBase },
    { label: "Site visits", href: screen === "list" ? undefined : base },
  ];
  if (screen === "new") breadcrumbs.push({ label: "New visit" });
  if (detail) breadcrumbs.push({ label: detail.revision.title, href: screen === "detail" ? undefined : recordBase });
  if (screen === "edit") breadcrumbs.push({ label: "Edit" });
  if (screen === "revision") breadcrumbs.push({ label: `Revision ${revisionNumber}` });

  if (screen === "list") {
    const visits = await getSiteVisits(tenantId, clientId, siteId);
    return <><DirectoryBreadcrumbs items={breadcrumbs} /><VisitHeading title="Site visits" eyebrow={site.name} description="Capture what you observe, what the client tells you and what still needs confirming.">{editable && <Link href={`${base}/new`} className={visitPrimary}><Plus className="size-4" aria-hidden="true" />New visit</Link>}</VisitHeading>{!editable && <ArchivedNotice />}<div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-slate-950 p-5 text-white sm:p-6"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><Building2 className="size-5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{site.name}</p><p className="mt-1 break-words text-xs leading-5 text-slate-300">{client.legal_name} · {site.address}</p></div><Link href={buildingBase} className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-200 underline-offset-4 hover:underline">View building</Link></div><VisitList visits={visits} baseHref={base} /><p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Internal workspace. Only active company owners can access site visits in this release.</p></>;
  }

  if (screen === "new" || screen === "edit") {
    const inventory = editable ? await getSiteInventory(tenantId, clientId, siteId) : undefined;
    return <><DirectoryBreadcrumbs items={breadcrumbs} /><VisitHeading eyebrow={site.name} title={screen === "new" ? "New site visit" : "Edit site visit"} description="A practical survey you can save as a draft and return to. Keep facts, assumptions and information gaps clearly identified." />{editable && inventory ? <VisitForm key={`${screen}:${visitId ?? "new"}`} tenantId={tenantId} clientId={clientId} site={site} inventory={inventory} detail={detail} initialId={visitId ?? randomUUID()} initialRequestId={randomUUID()} cancelHref={screen === "new" ? base : recordBase} /> : <><ArchivedNotice /><Link href={screen === "new" ? base : recordBase} className={visitSecondary}><ArrowLeft className="size-4" aria-hidden="true" />Back to visits</Link></>}</>;

  }

  if (!detail || !visitId) notFound();
  const revisions = await getVisitRevisions(tenantId, clientId, siteId, visitId);
  const revision = detail.revision;
  const historical = screen === "revision";
  return <><DirectoryBreadcrumbs items={breadcrumbs} /><VisitHeading eyebrow={historical ? `Saved revision ${revision.revision_number}` : "Site visit"} title={revision.title} description={`${revision.site_snapshot.name} · ${revision.client_snapshot.legal_name}`}><VisitStatus status={revision.status} />{!historical && editable && <Link href={`${recordBase}/edit`} className={visitPrimary}><Pencil className="size-4" aria-hidden="true" />Edit visit</Link>}{historical && <Link href={recordBase} className={visitSecondary}><ArrowLeft className="size-4" aria-hidden="true" />Current visit</Link>}</VisitHeading>{!editable && <ArchivedNotice />}{historical ? <div role="note" className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100"><History className="mt-1 size-4 shrink-0" aria-hidden="true" /><p>This is a read-only revision saved {displayTimestamp(revision.created_at)}. It keeps the answers, measurements, zone observations, template and building details recorded at that time. Changes to the building or portfolio do not alter it.</p></div> : <p className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden="true" />Revision {revision.revision_number}</span><span>Saved {displayTimestamp(revision.created_at)}</span><a href="#revision-history" className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">View history</a></p>}
    <VisitDetails detail={detail} />
    <div className="mt-6"><RevisionList revisions={revisions} baseHref={recordBase} selectedRevision={revision.revision_number} /></div>
  </>;
}

function VisitDetails({ detail }: { detail: SiteVisitDetail }) {
  const revision = detail.revision;
  const template = revision.template_snapshot;
  const progress = visitProgress(template, revision.answers);
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Visit date" value={displayDate(revision.visit_date)} icon={<CalendarDays className="size-4" aria-hidden="true" />} /><Metric label="Required answers recorded" value={`${progress.answered} / ${progress.required}`} note={`${progress.notApplicable} required marked not applicable`} /><Metric label="Information to follow up" value={String(progress.gaps.length)} note="Required gaps and unknown answers" /></div>
    <div className="grid items-start gap-6 lg:grid-cols-2"><section className={visitPanel}><h2 className="mb-5 text-lg font-semibold">Visit details</h2><dl className="grid gap-5 sm:grid-cols-2"><DetailField label="Reference" value={revision.reference} /><DetailField label="Visit lead" value={revision.lead_name} /><DetailField label="Contact name" value={revision.contact_name} /><DetailField label="Contact role" value={revision.contact_role} /><DetailField label="Contact email" value={revision.contact_email} /><DetailField label="Contact phone" value={revision.contact_phone} /></dl><p className="mt-5 text-xs leading-5 text-slate-500">The visit lead is a recorded name, not an access assignment.</p></section><section className={visitPanel}><h2 className="text-lg font-semibold">Building snapshot</h2><p className="mb-5 mt-2 text-xs leading-5 text-slate-500">Captured when this revision was saved. These details can differ from the current building record.</p><dl className="grid gap-5 sm:grid-cols-2"><DetailField label="Client" value={revision.client_snapshot.legal_name} /><DetailField label="Building" value={revision.site_snapshot.name} /><DetailField label="Building reference" value={revision.site_snapshot.reference} /><DetailField label="Building type" value={revision.site_snapshot.building_type.replaceAll("_", " ")} /><DetailField label="Address" value={revision.site_snapshot.address} /><DetailField label="Time zone" value={revision.site_snapshot.timezone} /></dl></section></div>
    <LayoutSnapshot layout={revision.layout_snapshot} />
    {progress.gaps.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 sm:p-7 dark:border-amber-900 dark:bg-amber-950/20"><h2 className="text-lg font-semibold">To follow up</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Resolve unknown answers and required gaps before relying on this survey for the next stage.</p><ul className="mt-4 grid gap-x-6 gap-y-3 lg:grid-cols-2">{progress.gaps.map((question) => <li key={question.id} className="text-sm leading-6"><a href={`#saved_${question.id}`} className="font-medium underline underline-offset-4">{question.label}</a>{revision.answers[question.id]?.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-500">{revision.answers[question.id].note}</p>}</li>)}</ul></section>}
    <section className={visitPanel}><h2 className="text-lg font-semibold">Survey responses</h2><p className="mt-2 text-xs leading-5 text-slate-500">{template.title} · template version {template.version}. Progress indicates recorded information, not approval.</p><div className="mt-8 space-y-8">{template.sections.map((section) => <section key={section.id}><h3 className="border-b border-slate-200 pb-3 text-sm font-semibold uppercase tracking-wider text-blue-700 dark:border-slate-700 dark:text-blue-300">{section.title}</h3><dl className="divide-y divide-slate-100 dark:divide-slate-800">{template.questions.filter((question) => question.section === section.id).map((question) => {
      const answer = revision.answers[question.id];
      return <div id={`saved_${question.id}`} key={question.id} className="scroll-mt-6 py-5"><dt className="text-sm font-semibold leading-6">{question.label}<span className="ml-2 text-xs font-normal text-slate-400">{question.required ? "Required" : "Optional"}</span></dt><dd className="mt-3 space-y-2"><p className={`whitespace-pre-wrap break-words text-sm leading-7 ${answer?.state === "unknown" ? "text-amber-700 dark:text-amber-300" : answer?.state === "unanswered" ? "text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>{answerValue(question, answer)}</p>{answer?.source && <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Source: {answerSources.find((source) => source.value === answer.source)?.label ?? answer.source}</span>}{answer?.note && <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">{answer.state === "not_applicable" ? "Reason" : "Note"}: {answer.note}</p>}</dd></div>;
    })}</dl></section>)}</div></section>
    <section className={visitPanel}><h2 className="mb-3 text-lg font-semibold">Additional visit notes</h2><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">{revision.notes || "No additional notes recorded."}</p></section>
  </div>;
}

function Metric({ label, value, note, icon }: { label: string; value: string; note?: string; icon?: React.ReactNode }) {
  return <div className={visitPanel}><p className="flex items-center gap-2 text-xs font-medium text-slate-500">{icon}{label}</p><p className="mt-3 break-words text-xl font-semibold tracking-tight">{value}</p>{note && <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>}</div>;
}

function VisitHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div className="min-w-0 max-w-2xl"><p className="break-words text-xs font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-300">{eyebrow}</p><h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>{description && <p className="mt-3 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>}</div>{children && <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>}</div>;
}

function ArchivedNotice() {
  return <p role="note" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">This client or building is archived. Saved visits and revisions remain available to read. Restore the client and building before creating or editing a visit.</p>;
}
