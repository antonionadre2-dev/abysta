"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ClipboardList, Search } from "lucide-react";
import type { RevisionSummary, VisitListRecord } from "@/lib/site-visits/types";
import { displayDate, displayTimestamp, VisitStatus, visitInput, visitPanel, visitSecondary } from "./visit-ui";

export function VisitList({ visits, baseHref }: { visits: VisitListRecord[]; baseHref: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [requestedPage, setPage] = useState(1);
  const filtered = visits.filter((visit) => (status === "all" || visit.status === status) && `${visit.title} ${visit.reference} ${visit.lead_name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(requestedPage, pages);
  return <section className={visitPanel} aria-labelledby="visits-list-heading">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="visits-list-heading" className="text-lg font-semibold">Visit records</h2><p role="status" className="mt-1 text-sm text-slate-500">{filtered.length} of {visits.length} visits</p></div><div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[minmax(200px,1fr)_150px]"><div><label htmlFor="visit-search" className="mb-2 block text-xs font-semibold">Search visits</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-400" aria-hidden="true" /><input id="visit-search" type="search" placeholder="Title, reference or visit lead" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className={`${visitInput} pl-9`} /></div></div><div><label htmlFor="visit-status-filter" className="mb-2 block text-xs font-semibold">Status</label><select id="visit-status-filter" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={visitInput}><option value="all">All visits</option><option value="draft">Draft</option><option value="in_progress">In progress</option></select></div></div></div>
    <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-800">{filtered.slice((page - 1) * 20, page * 20).map((visit) => <article key={visit.id} className="flex gap-4 py-5"><div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:flex dark:bg-blue-950 dark:text-blue-300"><ClipboardList className="size-5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><Link href={`${baseHref}/${visit.id}`} className="flex min-h-11 min-w-0 items-center gap-2 break-words text-base font-semibold underline-offset-4 hover:text-blue-700 hover:underline"><span className="min-w-0 break-words">{visit.title}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /></Link><VisitStatus status={visit.status} /></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-5 text-slate-500 dark:text-slate-400"><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden="true" />{displayDate(visit.visit_date)}</span><span>Lead: {visit.lead_name || "Not added"}</span><span>Revision {visit.row_version}</span>{visit.reference && <span className="break-all">{visit.reference}</span>}</div><p className="mt-2 text-xs text-slate-400">Saved {displayTimestamp(visit.updated_at)}</p></div></article>)}
      {filtered.length === 0 && <div className="py-12 text-center"><ClipboardList className="mx-auto size-8 text-slate-300" aria-hidden="true" /><p className="mt-4 font-medium">{visits.length ? "No visits match your filters" : "Your first visit starts here"}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{visits.length ? "Try a different search or status." : "Create a visit to capture client requirements, access details and information you still need to confirm."}</p></div>}
    </div>{pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}
  </section>;
}

export function RevisionList({ revisions, baseHref, selectedRevision }: { revisions: RevisionSummary[]; baseHref: string; selectedRevision: number }) {
  const [requestedPage, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(revisions.length / 20));
  const page = Math.min(requestedPage, pages);
  return <section className={visitPanel} aria-labelledby="revision-history"><h2 id="revision-history" className="text-lg font-semibold">Revision history</h2><p className="mt-2 text-sm leading-6 text-slate-500">Every successful save preserves a separate record of the answers and building details at that time.</p><ol className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">{revisions.slice((page - 1) * 20, page * 20).map((revision) => <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><Link href={`${baseHref}/revisions/${revision.revision_number}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700 underline-offset-4 hover:underline dark:text-blue-300">Revision {revision.revision_number}{selectedRevision === revision.revision_number && <span className="text-xs font-normal text-slate-500">Viewing</span>}</Link><p className="break-words text-xs text-slate-500">{displayTimestamp(revision.created_at)}</p></div><VisitStatus status={revision.status} /></li>)}</ol>{pages > 1 && <Pagination page={page} pages={pages} onPage={setPage} />}</section>;
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800"><button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={visitSecondary}>Previous</button><span className="text-xs">{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} className={visitSecondary}>Next</button></nav>;
}
