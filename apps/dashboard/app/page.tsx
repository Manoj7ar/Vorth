import Link from "next/link";

import { getGitLabAuthUrl } from "@/lib/auth";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
      <section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.3em] text-ink/60">
            Intelligent Chaos Engineering for GitLab
          </div>
          <h1 className="font-display text-5xl leading-tight md:text-7xl">
            Stress every merge request before production has to.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-ink/75">
            Vorth reads each MR diff, generates targeted chaos experiments with Claude and Gemini,
            scores resilience, opens fix MRs when failures appear, and gates deployment on the result.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href={getGitLabAuthUrl()}
              className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            >
              Sign in with GitLab
            </a>
            <Link
              href="/dashboard"
              className="rounded-full border border-ink/20 px-6 py-3 text-sm font-semibold text-ink"
            >
              View dashboard
            </Link>
          </div>
        </div>
        <div className="panel grid gap-4 p-8">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-teal">Flow</div>
            <div className="mt-2 font-display text-3xl">MR diff to deploy gate</div>
          </div>
          {[
            "Analyze changed services and resilience risk",
            "Generate targeted chaos hypotheses",
            "Run experiments inside an isolated namespace",
            "Score recovery and open fix MRs for failures",
          ].map((step, index) => (
            <div key={step} className="rounded-2xl bg-sand/60 p-4">
              <div className="text-xs uppercase tracking-[0.25em] text-ink/55">Step {index + 1}</div>
              <div className="mt-2 text-sm text-ink/75">{step}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
