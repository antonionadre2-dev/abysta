import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import Link from "next/link";
import { AlertCircle, Building2, Check, Globe2, ShieldCheck, Wallet } from "lucide-react";
import { CreateCompanyForm } from "@/components/company/create-company-form";
import { WorkspaceLoading } from "@/components/company/workspace-loading";
import { getWorkspaceState } from "@/lib/company/data";

function humanise(value: string) {
  return value.replaceAll("_", " ");
}

async function WorkspaceContent() {
  const state = await getWorkspaceState();

  if (state.kind === "error") {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <AlertCircle aria-hidden="true" className="mb-5 size-8 text-amber-700 dark:text-amber-400" />
        <h1 className="text-2xl font-semibold tracking-tight">Your workspace couldn’t be loaded</h1>
        <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">Please try again. If this continues, contact the person who manages your Abysta account.</p>
        <a href="/protected" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300">Try again</a>
      </section>
    );
  }

  if (state.workspaces.length === 0) {
    return (
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <section className="lg:pt-8">
          <span className="inline-flex rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold tracking-wide text-teal-900 dark:bg-teal-950 dark:text-teal-200">WELCOME TO ABYSTA</span>
          <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Start with your company.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-600 dark:text-slate-300">Give your team a place to work. Add your company details to create your workspace.</p>
          <div className="mt-8 flex max-w-md gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-semibold">A workspace for your company</h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">Only authorised company members can access its information. Your company details stay separate from other companies.</p>
            </div>
          </div>
        </section>
        <section aria-labelledby="create-company-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="create-company-heading" className="text-xl font-semibold tracking-tight">Create your company</h2>
          <p className="mb-7 mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Three details to get started.</p>
          <CreateCompanyForm initialRequestId={randomUUID()} />
        </section>
      </div>
    );
  }

  return (
    <section>
      <span className="text-xs font-semibold tracking-widest text-teal-700 dark:text-teal-400">YOUR WORKSPACE</span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{state.workspaces.length === 1 ? "Your company is ready." : "Your companies"}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">{state.workspaces.length === 1 ? "Your company details are saved. You can return to this workspace whenever you sign in." : "These are the company workspaces you have access to."}</p>
      <div className="mt-9 grid gap-6 lg:grid-cols-2">
        {state.workspaces.map(({ company, roles }) => (
          <article key={company.id} aria-labelledby={`company-${company.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-6 sm:p-7 dark:border-slate-800">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"><Building2 aria-hidden="true" size={24} strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1">
                <h2 id={`company-${company.id}`} className="break-words text-xl font-semibold tracking-tight">{company.name}</h2>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium capitalize text-teal-800 dark:text-teal-300"><Check size={14} aria-hidden="true" />{humanise(company.status)}</p>
              </div>
            </div>
            <dl className="space-y-6 p-6 sm:p-7">
              <div><dt className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Wallet size={15} aria-hidden="true" />Default currency</dt><dd className="mt-2 text-sm font-semibold">{company.currency}</dd></div>
              <div><dt className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Globe2 size={15} aria-hidden="true" />Time zone</dt><dd className="mt-2 break-words text-sm font-semibold">{company.timezone}</dd></div>
              <div>
                <dt className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><ShieldCheck size={15} aria-hidden="true" />Your role{roles.length === 1 ? "" : "s"}</dt>
                <dd className="mt-2 flex flex-wrap gap-2">{roles.map((role) => <span key={role} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{humanise(role)}</span>)}</dd>
              </div>
            </dl>
            <div className="border-t border-slate-100 px-6 py-5 sm:px-7 dark:border-slate-800">
              {roles.includes("owner") ? <Link href={`/protected/workspaces/${company.id}/clients`} className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:bg-teal-400 dark:text-slate-950">Open clients</Link> : <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">The client directory is currently available to company owners. Contact your owner about access.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ProtectedPage() {
  return <Suspense fallback={<WorkspaceLoading />}><WorkspaceContent /></Suspense>;
}
