"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { DirectoryImage, StatusBadge, secondaryLink } from "./directory-ui";

export type DirectoryListRow = { id: string; title: string; description?: string; status: string; href: string; imageAssetId?: string | null; detail?: string };

export function DirectoryList({ tenantId, rows, label, emptyMessage }: { tenantId: string; rows: DirectoryListRow[]; label: string; emptyMessage: string }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const filtered = rows.filter((row) => (status === "all" || row.status === status) && `${row.title} ${row.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:p-5 dark:border-slate-800">
      <div className="flex-1"><label htmlFor={`${id}-search`} className="mb-2 block text-xs font-semibold">Search {label.toLowerCase()}</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-400" /><input id={`${id}-search`} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search by name, reference or address" className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700 dark:border-slate-700 dark:bg-slate-950" /></div></div>
      <div><label htmlFor={`${id}-status`} className="mb-2 block text-xs font-semibold">Show</label><select id={`${id}-status`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700 sm:w-36 dark:border-slate-700 dark:bg-slate-950"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select></div>
    </div>
    <p className="px-5 pt-4 text-xs text-slate-500 dark:text-slate-400" role="status">{filtered.length} {label.toLowerCase()} found{query ? ` for “${query}”` : ""}</p>
    {visible.length ? <ul className="divide-y divide-slate-100 px-5 dark:divide-slate-800">{visible.map((row) => <li key={row.id}><Link href={row.href} className="group flex items-center gap-4 rounded-lg py-5 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><DirectoryImage tenantId={tenantId} assetId={row.imageAssetId} alt={`${row.title} image`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h3 className="break-words text-sm font-semibold group-hover:text-teal-700 dark:group-hover:text-teal-300">{row.title}</h3><StatusBadge status={row.status} /></div>{row.description && <p className="mt-1.5 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{row.description}</p>}{row.detail && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{row.detail}</p>}</div><ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" /></Link></li>)}</ul> : <div className="p-8 text-center"><p className="text-sm font-medium">{rows.length ? "No matching records" : emptyMessage}</p>{rows.length > 0 && <button type="button" onClick={() => { setQuery(""); setStatus("all"); setPage(1); }} className="mt-3 text-sm font-semibold text-teal-700 underline underline-offset-4 dark:text-teal-300">Clear filters</button>}</div>}
    {pages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 dark:border-slate-800"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={`${secondaryLink} disabled:opacity-40`}>Previous</button><p className="text-xs text-slate-500">Page {currentPage} of {pages} · 20 per page</p><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={`${secondaryLink} disabled:opacity-40`}>Next</button></div>}
  </div>;
}
