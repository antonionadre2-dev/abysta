import Link from "next/link";
import { Building2, ChevronRight, ImageIcon } from "lucide-react";

export const primaryLink = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300";
export const secondaryLink = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";
export const panelClasses = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 dark:border-slate-800 dark:bg-slate-900";

export function DirectoryBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="mb-7"><ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-slate-500 dark:text-slate-400">{items.map((item, index) => <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-2">{index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}{item.href ? <Link href={item.href} className="break-words underline-offset-4 hover:underline">{item.label}</Link> : <span aria-current="page" className="break-words font-medium text-slate-800 dark:text-slate-200">{item.label}</span>}</li>)}</ol></nav>;
}

export function DirectoryHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div className="min-w-0 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-400">{eyebrow}</p><h1 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>{description && <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>}</div>{children && <div className="flex shrink-0 flex-wrap gap-3">{children}</div>}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${status === "active" ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{status}</span>;
}

export function DirectoryImage({ tenantId, assetId, alt, large = false }: { tenantId: string; assetId?: string | null; alt: string; large?: boolean }) {
  return <div className={large ? "flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800" : "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"}>{assetId ?
    // Private images are served by an authenticated, no-store route.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/directory-images/${tenantId}/${assetId}`} alt={alt} className={`size-full ${large ? "object-contain" : "object-cover"}`} /> : large ? <ImageIcon className="size-10 text-slate-400" aria-label="No image added" /> : <Building2 className="size-6" aria-hidden="true" />}</div>;
}

export function DirectoryLoading() {
  return <div role="status" aria-live="polite" className="space-y-6"><span className="sr-only">Loading your directory…</span><div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /><div className="h-10 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /></div>;
}

export function DetailField({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{value || <span className="text-slate-400">Not added</span>}</dd></div>;
}
