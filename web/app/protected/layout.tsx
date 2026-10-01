import Link from "next/link";
import { Building2 } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <a href="#workspace-content" className="sr-only z-50 rounded-lg bg-white p-3 text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <nav aria-label="Main navigation" className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/protected" aria-label="Abysta workspace" className="flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">
            <span className="flex size-10 items-center justify-center rounded-xl bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950"><Building2 size={22} strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="text-2xl font-semibold tracking-tight">abysta<span className="text-teal-700 dark:text-teal-400">.</span></span>
          </Link>
          <div className="flex items-center gap-3"><ThemeSwitcher /><LogoutButton /></div>
        </nav>
      </header>
      <main id="workspace-content" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-16">{children}</main>
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500 sm:px-8 dark:text-slate-400"><p>Abysta · Your company workspace</p></footer>
    </div>
  );
}
