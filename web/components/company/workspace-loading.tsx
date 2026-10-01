export function WorkspaceLoading() {
  return (
    <section aria-busy="true" role="status" aria-label="Loading your workspace" className="mx-auto w-full max-w-5xl py-8">
      <p className="mb-8 text-sm text-slate-600 dark:text-slate-300">Loading your workspace…</p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-9 w-2/3 max-w-md rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-5 w-1/2 max-w-sm rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-64 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    </section>
  );
}
