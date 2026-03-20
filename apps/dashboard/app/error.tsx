"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
      <div className="panel max-w-md p-8 text-center">
        <div className="text-xs uppercase tracking-[0.25em] text-coral">Error</div>
        <h2 className="mt-2 font-display text-3xl">Something went wrong</h2>
        <p className="mt-3 text-sm text-ink/70">{error.message}</p>
        <button
          onClick={reset}
          className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
