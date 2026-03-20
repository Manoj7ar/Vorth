import { type ExperimentResult, type Hypothesis, type ResilienceScore } from "@vorth/shared-types";

function severityPenalty(severity: Hypothesis["severity"]) {
  if (severity === 5) {
    return 25;
  }
  if (severity === 4) {
    return 15;
  }
  if (severity === 3) {
    return 8;
  }
  return 3;
}

function roundScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreCategory(results: ExperimentResult[], hypotheses: Hypothesis[], types: Hypothesis["experimentType"][]) {
  const relevantResults = results.filter((result) => {
    const hypothesis = hypotheses.find((item) => item.id === result.hypothesisId);
    return hypothesis ? types.includes(hypothesis.experimentType) : false;
  });

  if (relevantResults.length === 0) {
    return 100;
  }

  const failures = relevantResults.filter((result) => !result.passed);
  const totalPenalty = failures.reduce((sum, result) => {
    const hypothesis = hypotheses.find((item) => item.id === result.hypothesisId);
    return sum + severityPenalty(hypothesis?.severity ?? 1);
  }, 0);

  return roundScore(100 - totalPenalty);
}

export function computeResilienceScore(results: ExperimentResult[], hypotheses: Hypothesis[]): ResilienceScore {
  const failures = results.filter((result) => !result.passed);
  const passed = results.length - failures.length;
  const deductions = failures.reduce((sum, result) => {
    const hypothesis = hypotheses.find((item) => item.id === result.hypothesisId);
    return sum + severityPenalty(hypothesis?.severity ?? 1);
  }, 0);

  const allFailuresRecoveredQuickly = failures.every(
    (result) => (result.metrics.recoveryTimeSeconds ?? Number.MAX_SAFE_INTEGER) < 30,
  );

  const overall = roundScore(100 - deductions + (failures.length > 0 && allFailuresRecoveredQuickly ? 5 : 0));
  const criticalFailures = failures.flatMap((result) => {
    const hypothesis = hypotheses.find((item) => item.id === result.hypothesisId);
    return hypothesis && hypothesis.severity >= 4
      ? [`${hypothesis.targetService}: ${result.failureDescription ?? hypothesis.expectedFailureMode}`]
      : [];
  });

  const minScore = Number(process.env.MIN_RESILIENCE_SCORE ?? "70");
  const deploymentAllowed = overall >= minScore;
  const recommendation: ResilienceScore["recommendation"] = overall >= minScore
    ? "deploy"
    : criticalFailures.length > 0
      ? "do-not-deploy"
      : "fix-required";

  return {
    overall,
    breakdown: {
      networkResilience: scoreCategory(results, hypotheses, ["network-partition", "latency-injection"]),
      dependencyResilience: scoreCategory(results, hypotheses, ["dependency-failure"]),
      loadResilience: scoreCategory(results, hypotheses, ["cpu-stress", "memory-stress"]),
      recoverySpeed: failures.length === 0 ? 100 : allFailuresRecoveredQuickly ? 100 : 40,
    },
    passed,
    failed: failures.length,
    criticalFailures,
    deploymentAllowed,
    recommendation,
  };
}
