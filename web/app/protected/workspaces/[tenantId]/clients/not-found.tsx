import Link from "next/link";
export default function DirectoryNotFound() {
  return <section className="mx-auto max-w-xl rounded-2xl border bg-white p-8 dark:bg-slate-900"><h1 className="text-2xl font-semibold">This record isn’t available</h1><p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">Check the link and your access to this company.</p><Link href="/protected" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-5 font-semibold text-white">Back to your workspace</Link></section>;
}
