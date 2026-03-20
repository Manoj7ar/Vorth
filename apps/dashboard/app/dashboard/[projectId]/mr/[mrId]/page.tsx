import { notFound } from "next/navigation";

import { ChaosResultCard } from "@/components/ChaosResultCard";
import { DeployGateStatus } from "@/components/DeployGateStatus";
import { ExperimentTimeline } from "@/components/ExperimentTimeline";
import { FixMRButton } from "@/components/FixMRButton";
import { ResilienceScoreBadge } from "@/components/ResilienceScoreBadge";
import { requireSession } from "@/lib/auth";
import { getMergeRequestView } from "@/lib/db";

export default async function MergeRequestPage({
  params,
}: {
  params: { projectId: string; mrId: string };
}) {
  await requireSession();
  const projectId = Number.parseInt(params.projectId, 10);
  const mrId = Number.parseInt(params.mrId, 10);
  const detail = await getMergeRequestView(projectId, mrId);

  if (!detail) {
    notFound();
  }

  const experiments = detail.experiments.map((experiment, index) => {
    const hypothesis = experiment.data[index] ?? experiment.data[0];
    return {
      name: hypothesis?.experimentType ?? "Experiment",
      target: hypothesis?.targetService ?? detail.source_branch,
      durationSeconds: experiment.duration_seconds,
      passed: experiment.passed,
      keyMetric: experiment.passed
        ? `Error rate ${(experiment.metrics.errorRate * 100).toFixed(1)}%`
        : experiment.failure_description ?? "Failure detected",
    };
  });

  const failedExperiments = detail.experiments.filter((experiment) => !experiment.passed);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col justify-between gap-6 md:flex-row">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-ink/55">MR !{mrId}</div>
          <h1 className="mt-2 font-display text-5xl">{detail.title}</h1>
          <p className="mt-4 max-w-3xl text-lg text-ink/75">{detail.claude_analysis ?? detail.status}</p>
        </div>
        <ResilienceScoreBadge
          score={detail.score_overall ?? 0}
          deploymentAllowed={detail.deployment_allowed ?? false}
        />
      </div>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <ExperimentTimeline items={experiments} />
        <div className="space-y-6">
          <DeployGateStatus
            deploymentAllowed={detail.deployment_allowed ?? false}
            recommendation={detail.recommendation}
          />
          <FixMRButton href={detail.fix_mr_url} />
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        {failedExperiments.map((experiment, index) => (
          <ChaosResultCard
            key={`${experiment.duration_seconds}-${index}`}
            title={`Failure ${index + 1}`}
            description={experiment.failure_description ?? "Failure detected during chaos execution."}
            recommendation={detail.claude_analysis ?? "No recommendation available."}
          />
        ))}
      </section>
    </main>
  );
}
