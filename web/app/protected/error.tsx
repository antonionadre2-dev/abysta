"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-lg rounded-2xl border bg-card p-8" role="alert">
      <h1 className="text-xl font-semibold">We couldn’t open your workspace</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Your information has not been cleared. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Try again
      </button>
    </section>
  );
}
