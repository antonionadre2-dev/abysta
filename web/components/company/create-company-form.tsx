"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompanyAction } from "@/lib/company/actions";
import type { CompanyActionState } from "@/lib/company/types";

const initialState: CompanyActionState = {};
const currencies = [
  ["GBP", "GBP — British pound"],
  ["CHF", "CHF — Swiss franc"],
  ["EUR", "EUR — Euro"],
  ["USD", "USD — US dollar"],
] as const;
const timezones = [
  ["Europe/London", "London — Europe/London"],
  ["Europe/Zurich", "Zurich — Europe/Zurich"],
  ["Europe/Madrid", "Madrid — Europe/Madrid"],
  ["Europe/Paris", "Paris — Europe/Paris"],
  ["Europe/Berlin", "Berlin — Europe/Berlin"],
  ["Europe/Lisbon", "Lisbon — Europe/Lisbon"],
  ["America/New_York", "New York — America/New_York"],
  ["America/Los_Angeles", "Los Angeles — America/Los_Angeles"],
  ["UTC", "Coordinated Universal Time — UTC"],
] as const;
const selectClasses = "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-teal-400 dark:focus-visible:ring-offset-slate-900";

export function CreateCompanyForm({ initialRequestId }: { initialRequestId: string }) {
  const [state, formAction, pending] = useActionState(createCompanyAction, initialState);
  const [requestId] = useState(initialRequestId);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [timezone, setTimezone] = useState("Europe/London");
  const errorRef = useRef<HTMLDivElement>(null);
  const hasErrors = Boolean(state.error || Object.values(state.fieldErrors ?? {}).some(Boolean));

  useEffect(() => {
    if (hasErrors && !pending) errorRef.current?.focus();
  }, [state, hasErrors, pending]);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-7">
      <input type="hidden" name="requestId" value={requestId} />
      {hasErrors && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">{state.error || "Please check the highlighted fields."}</p>
          {state.fieldErrors && (
            <ul className="mt-2 space-y-1">
              {Object.entries(state.fieldErrors).map(([field, error]) => error ? (
                <li key={field}><a href={`#${field}`} className="underline underline-offset-2">{error}</a></li>
              ) : null)}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={pending} className="space-y-6">
        <legend className="sr-only">Company details</legend>
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-semibold">Company name <span className="font-normal text-slate-500">(required)</span></Label>
          <Input id="name" name="name" autoComplete="organization" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your company name" aria-invalid={Boolean(state.fieldErrors?.name)} aria-describedby={`name-help${state.fieldErrors?.name ? " name-error" : ""}`} className="h-12 rounded-lg border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950" />
          <p id="name-help" className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">The company you work for, rather than a client or building. Use 2–120 characters.</p>
          {state.fieldErrors?.name && <p id="name-error" className="text-sm text-red-700 dark:text-red-300">{state.fieldErrors.name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency" className="text-sm font-semibold">Default currency <span className="font-normal text-slate-500">(required)</span></Label>
          <select id="currency" name="currency" required value={currency} onChange={(event) => setCurrency(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.currency)} aria-describedby={state.fieldErrors?.currency ? "currency-error" : undefined} className={selectClasses}>
            {currencies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {state.fieldErrors?.currency && <p id="currency-error" className="text-sm text-red-700 dark:text-red-300">{state.fieldErrors.currency}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone" className="text-sm font-semibold">Time zone <span className="font-normal text-slate-500">(required)</span></Label>
          <select id="timezone" name="timezone" required value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.timezone)} aria-describedby={`timezone-help${state.fieldErrors?.timezone ? " timezone-error" : ""}`} className={selectClasses}>
            {timezones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <p id="timezone-help" className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Choose the time zone where your company operates.</p>
          {state.fieldErrors?.timezone && <p id="timezone-error" className="text-sm text-red-700 dark:text-red-300">{state.fieldErrors.timezone}</p>}
        </div>
      </fieldset>
      <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="mb-5 flex gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <p>You will be the owner of this company workspace.</p>
        </div>
        <Button type="submit" disabled={pending} className="h-12 w-full rounded-lg bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-600 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300">
          {pending ? <><LoaderCircle aria-hidden="true" className="animate-spin" /> Creating your company…</> : <>Create company <ArrowRight aria-hidden="true" /></>}
        </Button>
        <p className="sr-only" role="status" aria-live="polite">{pending ? "Saving your company. Please wait." : ""}</p>
      </div>
    </form>
  );
}
