import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <nav aria-label="Main navigation" className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="text-2xl font-semibold tracking-tight" aria-label="Abysta home">abysta<span className="text-teal-700 dark:text-teal-400">.</span></Link>
          <div className="flex items-center gap-5"><ThemeSwitcher /><Link href="/auth/login" className="text-sm font-semibold underline-offset-4 hover:underline">Sign in</Link></div>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950"><Building2 size={30} strokeWidth={1.5} aria-hidden="true" /></span>
          <p className="mt-8 text-xs font-semibold tracking-widest text-teal-700 dark:text-teal-400">YOUR COMPANY. YOUR WORKSPACE.</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">A clearer start to your next tender.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">Welcome to Abysta. Start by setting up a dedicated workspace for your facilities management company.</p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link href="/protected" className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300">Open workspace <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/auth/sign-up" className="inline-flex min-h-12 items-center text-sm font-semibold underline-offset-4 hover:underline">Create an account</Link>
          </div>
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-slate-500 sm:px-8 dark:text-slate-400">Abysta · Facilities management sales</footer>
    </div>
  );
}
