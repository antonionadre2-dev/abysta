import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, FolderOpen, Plus, Pencil, ArrowLeft } from "lucide-react";
import { getDirectorySnapshot } from "@/lib/directory/data";
import { isUuid } from "@/lib/directory/validation";
import type { ClientRecord, DirectoryKind, PortfolioRecord, SiteRecord } from "@/lib/directory/types";
import { DirectoryList } from "./directory-list";
import { DirectoryForm } from "./directory-form";
import { DirectoryImageUploader } from "./image-uploader";
import { DirectoryBreadcrumbs, DirectoryHeading, DirectoryImage, DetailField, StatusBadge, panelClasses, primaryLink, secondaryLink } from "./directory-ui";

type Params = { tenantId: string; clientId?: string; siteId?: string; portfolioId?: string };
type Screen = "clients" | "client" | "client-new" | "client-edit" | "site" | "site-new" | "site-edit" | "portfolio" | "portfolio-new" | "portfolio-edit";

function ArchivedNotice({ parent = false }: { parent?: boolean }) {
  return <p role="note" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{parent ? "This client is archived. Its records are preserved. Restore the client before changing its buildings, portfolios or images." : "This record is archived. Its details and existing links are preserved. Use Edit to restore it when needed."}</p>;
}
function ContactDetails({ record, title }: { record: ClientRecord | SiteRecord; title: string }) {
  return <section className={panelClasses}><h2 className="mb-5 text-base font-semibold">{title}</h2><dl className="grid gap-5 sm:grid-cols-2"><DetailField label="Name" value={record.contact_name} /><DetailField label="Role" value={record.contact_role} /><DetailField label="Email" value={record.contact_email} /><DetailField label="Phone" value={record.contact_phone} /></dl></section>;
}
function Notes({ value }: { value: string }) {
  return <section className={panelClasses}><h2 className="mb-3 text-base font-semibold">Notes</h2><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">{value || "No notes added."}</p></section>;
}
function ImagePanel({ tenantId, kind, record, editable, title }: { tenantId: string; kind: "client" | "site"; record: ClientRecord | SiteRecord; editable: boolean; title: string }) {
  if (editable) return <DirectoryImageUploader tenantId={tenantId} kind={kind} recordId={record.id} rowVersion={record.row_version} currentAssetId={record.image_asset_id} />;
  return <section className={panelClasses}><h2 className="mb-5 text-base font-semibold">{title}</h2><DirectoryImage tenantId={tenantId} assetId={record.image_asset_id} alt={`${"legal_name" in record ? record.legal_name : record.name} image`} large /></section>;
}

export async function DirectoryScreen({ params, screen }: { params: Promise<Params>; screen: Screen }) {
  const raw = await params;
  if (Object.values(raw).some((value) => value !== undefined && !isUuid(value))) notFound();
  const tenantId = raw.tenantId.toLowerCase();
  const clientId = raw.clientId?.toLowerCase();
  const siteId = raw.siteId?.toLowerCase();
  const portfolioId = raw.portfolioId?.toLowerCase();
  const { company, clients, sites, portfolios, links } = await getDirectorySnapshot(tenantId);
  const base = `/protected/workspaces/${tenantId}/clients`;
  const client = clientId ? clients.find((item) => item.id === clientId) : undefined;
  if (clientId && !client) notFound();
  const clientBase = `${base}/${clientId}`;
  const site = siteId ? sites.find((item) => item.id === siteId && item.client_company_id === clientId) : undefined;
  const portfolio = portfolioId ? portfolios.find((item) => item.id === portfolioId && item.client_company_id === clientId) : undefined;
  if ((siteId && !site) || (portfolioId && !portfolio)) notFound();
  const breadcrumbs: { label: string; href?: string }[] = [{ label: company.name, href: "/protected" }, { label: "Clients", href: screen === "clients" ? undefined : base }];
  if (client) breadcrumbs.push({ label: client.legal_name, href: screen === "client" ? undefined : clientBase });
  if (site) breadcrumbs.push({ label: site.name, href: screen === "site" ? undefined : `${clientBase}/buildings/${site.id}` });
  if (portfolio) breadcrumbs.push({ label: portfolio.name, href: screen === "portfolio" ? undefined : `${clientBase}/portfolios/${portfolio.id}` });
  if (screen.endsWith("-new")) breadcrumbs.push({ label: screen === "client-new" ? "New client" : screen === "site-new" ? "New building" : "New portfolio" });
  if (screen.endsWith("-edit")) breadcrumbs.push({ label: "Edit" });

  const buildingRows = (items: SiteRecord[]) => items.map((item) => ({ id: item.id, title: item.name, description: [item.reference, item.address].filter(Boolean).join(" · "), status: item.status, href: `${base}/${item.client_company_id}/buildings/${item.id}`, imageAssetId: item.image_asset_id, detail: item.building_type.replaceAll("_", " ") }));
  const portfolioRows = (items: PortfolioRecord[]) => items.map((item) => {
    const linkedIds = new Set(links.filter((link) => link.portfolio_id === item.id).map((link) => link.site_id));
    const archivedCount = sites.filter((linkedSite) => linkedIds.has(linkedSite.id) && linkedSite.status === "archived").length;
    const buildingLabel = `${linkedIds.size} linked ${linkedIds.size === 1 ? "building" : "buildings"}`;
    return { id: item.id, title: item.name, description: item.reference || undefined, status: item.status, href: `${base}/${item.client_company_id}/portfolios/${item.id}`, detail: archivedCount > 0 ? `${buildingLabel} · ${archivedCount} archived` : buildingLabel };
  });

  if (screen === "clients") return <>
    <DirectoryBreadcrumbs items={breadcrumbs} />
    <DirectoryHeading eyebrow={company.name} title="Clients" description="Your client relationships and the buildings you look after."><Link href={`${base}/new`} className={primaryLink}><Plus size={16} aria-hidden="true" />New client</Link></DirectoryHeading>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex min-w-0 items-center gap-4"><DirectoryImage tenantId={tenantId} assetId={company.logo_asset_id} alt={`${company.name} logo`} /><div className="min-w-0"><p className="break-words text-sm font-semibold">{company.name}</p><p className="mt-1 text-xs text-slate-500">{company.currency} · {company.timezone}</p></div></div><details className="w-full sm:w-auto"><summary className="cursor-pointer text-sm font-semibold text-teal-700 dark:text-teal-300">Manage company logo</summary><div className="mt-4 max-w-sm"><DirectoryImageUploader tenantId={tenantId} kind="company" recordId={tenantId} rowVersion={company.row_version} currentAssetId={company.logo_asset_id} /></div></details></div>
    <DirectoryList tenantId={tenantId} label="Clients" emptyMessage="Add your first client to get started." rows={clients.map((item) => ({ id: item.id, title: item.legal_name, description: [item.reference, item.address].filter(Boolean).join(" · "), status: item.status, href: `${base}/${item.id}`, imageAssetId: item.image_asset_id, detail: `${sites.filter((s) => s.client_company_id === item.id).length} buildings · ${portfolios.filter((p) => p.client_company_id === item.id).length} portfolios` }))} />
  </>;

  if (screen.endsWith("-new") || screen.endsWith("-edit")) {
    const kind: DirectoryKind = screen.startsWith("client") ? "client" : screen.startsWith("site") ? "site" : "portfolio";
    const isNew = screen.endsWith("-new");
    const record = isNew ? undefined : kind === "client" ? client : kind === "site" ? site : portfolio;
    if (!isNew && !record) notFound();
    const noun = kind === "site" ? "building" : kind;
    const cancelHref = isNew ? kind === "client" ? base : clientBase : kind === "client" ? clientBase : `${clientBase}/${kind === "site" ? "buildings" : "portfolios"}/${record!.id}`;
    return <><DirectoryBreadcrumbs items={breadcrumbs} /><DirectoryHeading eyebrow={client?.legal_name ?? company.name} title={`${isNew ? "New" : "Edit"} ${noun}`} description={kind === "portfolio" ? "Group existing buildings from this client. Their details stay in one place." : kind === "site" ? "Keep this building’s address, contact and access notes together." : "Add the organisation that buys your services and its main contact."} />{kind !== "client" && client?.status === "archived" ? <><ArchivedNotice parent /><Link href={clientBase} className={secondaryLink}><ArrowLeft size={16} aria-hidden="true" />Back to client</Link></> : <DirectoryForm key={`${screen}:${record?.id ?? "new"}`} kind={kind} tenantId={tenantId} clientId={clientId} record={record} sites={sites.filter((item) => item.client_company_id === clientId)} selectedSiteIds={portfolio ? links.filter((link) => link.portfolio_id === portfolio.id).map((link) => link.site_id) : []} initialRequestId={randomUUID()} initialId={record?.id ?? randomUUID()} cancelHref={cancelHref} timezone={company.timezone} />}</>;
  }

  if (screen === "client" && client) return <>
    <DirectoryBreadcrumbs items={breadcrumbs} />
    <DirectoryHeading eyebrow="Client" title={client.legal_name} description={client.reference || undefined}><StatusBadge status={client.status} /><Link href={`${clientBase}/edit`} className={secondaryLink}><Pencil size={15} aria-hidden="true" />Edit client</Link></DirectoryHeading>
    {client.status === "archived" && <ArchivedNotice parent />}
    <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-6"><section className={panelClasses}><h2 className="mb-5 text-base font-semibold">Client details</h2><dl className="grid gap-5 sm:grid-cols-2"><DetailField label="Reference" value={client.reference} /><DetailField label="Address" value={client.address} /></dl></section><ContactDetails record={client} title="Main contact" /><Notes value={client.notes} /></div><ImagePanel tenantId={tenantId} kind="client" record={client} editable={client.status === "active"} title="Client logo" /></div>
    <section className="mt-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><Building2 size={20} aria-hidden="true" />Buildings</h2>{client.status === "active" && <Link href={`${clientBase}/buildings/new`} className={primaryLink}><Plus size={16} aria-hidden="true" />New building</Link>}</div><DirectoryList tenantId={tenantId} label="Buildings" emptyMessage="Add this client’s first building." rows={buildingRows(sites.filter((item) => item.client_company_id === clientId))} /></section>
    <section className="mt-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><FolderOpen size={20} aria-hidden="true" />Portfolios</h2>{client.status === "active" && <Link href={`${clientBase}/portfolios/new`} className={primaryLink}><Plus size={16} aria-hidden="true" />New portfolio</Link>}</div><DirectoryList tenantId={tenantId} label="Portfolios" emptyMessage="Create a portfolio to group this client’s buildings." rows={portfolioRows(portfolios.filter((item) => item.client_company_id === clientId))} /></section>
  </>;

  if (screen === "site" && site && client) return <>
    <DirectoryBreadcrumbs items={breadcrumbs} /><DirectoryHeading eyebrow="Building" title={site.name} description={client.legal_name}><StatusBadge status={site.status} />{client.status === "active" && <Link href={`${clientBase}/buildings/${site.id}/edit`} className={secondaryLink}><Pencil size={15} aria-hidden="true" />Edit building</Link>}</DirectoryHeading>
    {client.status === "archived" ? <ArchivedNotice parent /> : site.status === "archived" && <ArchivedNotice />}
    <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-6"><ImagePanel tenantId={tenantId} kind="site" record={site} editable={site.status === "active" && client.status === "active"} title="Building image" /><Notes value={site.notes} /></div><div className="space-y-6"><section className={panelClasses}><h2 className="mb-5 text-base font-semibold">Building details</h2><dl className="space-y-5"><DetailField label="Reference" value={site.reference} /><DetailField label="Address" value={site.address} /><DetailField label="Building type" value={site.building_type.replaceAll("_", " ")} /><DetailField label="Time zone" value={site.timezone} /></dl></section><ContactDetails record={site} title="Site visit contact" /></div></div>
    <section className="mt-10"><h2 className="mb-4 text-xl font-semibold">Portfolios containing this building</h2><DirectoryList tenantId={tenantId} label="Portfolios" emptyMessage="This building has not been added to a portfolio." rows={portfolioRows(portfolios.filter((item) => links.some((link) => link.site_id === site.id && link.portfolio_id === item.id)))} /></section>
  </>;

  if (screen === "portfolio" && portfolio && client) {
    const selectedIds = new Set(links.filter((link) => link.portfolio_id === portfolio.id).map((link) => link.site_id));
    const selected = sites.filter((item) => item.client_company_id === clientId && selectedIds.has(item.id));
    const activeCount = selected.filter((item) => item.status === "active").length;
    return <><DirectoryBreadcrumbs items={breadcrumbs} /><DirectoryHeading eyebrow="Portfolio" title={portfolio.name} description={client.legal_name}><StatusBadge status={portfolio.status} />{client.status === "active" && <Link href={`${clientBase}/portfolios/${portfolio.id}/edit`} className={secondaryLink}><Pencil size={15} aria-hidden="true" />Edit portfolio</Link>}</DirectoryHeading>{client.status === "archived" ? <ArchivedNotice parent /> : portfolio.status === "archived" && <ArchivedNotice />}<div className="mb-7 grid gap-6 md:grid-cols-2"><section className={panelClasses}><h2 className="mb-5 text-base font-semibold">Portfolio details</h2><dl className="grid gap-5 sm:grid-cols-2"><DetailField label="Reference" value={portfolio.reference} /><DetailField label="Linked buildings" value={`${selected.length} total · ${activeCount} active · ${selected.length-activeCount} archived`} /></dl></section><Notes value={portfolio.notes} /></div><DirectoryList tenantId={tenantId} label="Buildings" emptyMessage="Edit this portfolio to select existing buildings." rows={buildingRows(selected)} /></>;
  }
  notFound();
}
