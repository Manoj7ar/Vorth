import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getProjectView } from "@/lib/db";

export default async function ProjectPage({ params }: { params: { projectId: string } }) {
  await requireSession();
  const projectId = Number.parseInt(params.projectId, 10);
  const data = await getProjectView(projectId);

  if (!data) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-ink/55">{data.project.namespace}</div>
          <h1 className="mt-2 font-display text-5xl">{data.project.name}</h1>
        </div>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="panel p-6 md:col-span-2">
          <h2 className="font-display text-3xl">Merge Requests</h2>
          <div className="mt-6 space-y-3">
            {data.mergeRequests.map((mr) => (
              <Link
                key={mr.gitlab_mr_id}
                href={`/dashboard/${projectId}/mr/${mr.gitlab_mr_id}`}
                className="flex items-center justify-between rounded-2xl bg-sand/60 p-4 transition hover:bg-sand"
              >
                <div>
                  <div className="font-semibold">{mr.title}</div>
                  <div className="text-sm text-ink/65">MR !{mr.gitlab_mr_id}</div>
                </div>
                <div className="text-sm uppercase tracking-[0.2em] text-ink/60">{mr.status}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="font-display text-3xl">Score Trend</h2>
          <div className="mt-6 space-y-3">
            {data.scoreTrend.map((point) => (
              <div key={point.created_at} className="flex items-center justify-between text-sm">
                <span>{new Date(point.created_at).toLocaleDateString()}</span>
                <span className="font-semibold">{point.overall}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="font-display text-3xl">Recent Experiments</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-ink/55">
              <tr>
                <th className="pb-3">Created</th>
                <th className="pb-3">Result</th>
                <th className="pb-3">Duration</th>
                <th className="pb-3">Failure</th>
              </tr>
            </thead>
            <tbody>
              {data.experiments.map((experiment) => (
                <tr key={`${experiment.created_at}-${experiment.duration_seconds}`} className="border-t border-ink/10">
                  <td className="py-3">{new Date(experiment.created_at).toLocaleString()}</td>
                  <td className="py-3">{experiment.passed ? "Passed" : "Failed"}</td>
                  <td className="py-3">{experiment.duration_seconds}s</td>
                  <td className="py-3">{experiment.failure_description ?? "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
