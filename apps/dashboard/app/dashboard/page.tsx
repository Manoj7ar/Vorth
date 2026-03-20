import Link from "next/link";

import { requireSession } from "@/lib/auth";
import { getProjectsOverview } from "@/lib/db";

export default async function DashboardPage() {
  await requireSession();
  const projects = await getProjectsOverview();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-ink/55">Connected Projects</div>
          <h1 className="mt-2 font-display text-5xl">Resilience Overview</h1>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.gitlab_project_id}
            href={`/dashboard/${project.gitlab_project_id}`}
            className="panel block p-6 transition hover:-translate-y-1"
          >
            <div className="text-xs uppercase tracking-[0.25em] text-ink/55">{project.namespace}</div>
            <div className="mt-2 font-display text-3xl">{project.name}</div>
            <div className="mt-4 text-sm text-ink/70">
              Latest resilience score: {project.latest_score ?? "Not yet scored"}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
