"use client";
export default function DirectoryError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-xl rounded-2xl border bg-white p-8 dark:bg-slate-900"><h1 className="text-2xl font-semibold">Your directory couldn’t be loaded</h1><p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">Please try again. If this continues, contact the person who manages your Abysta account.</p><button type="button" onClick={reset} className="mt-6 min-h-11 rounded-lg bg-teal-700 px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Try again</button></section>;
}
