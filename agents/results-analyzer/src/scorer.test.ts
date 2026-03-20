import { describe, expect, it } from "vitest";

import type { ExperimentResult, Hypothesis } from "@vorth/shared-types";

import { computeResilienceScore } from "./scorer.js";

function makeHypothesis(overrides: Partial<Hypothesis>): Hypothesis {
  return {
    id: crypto.randomUUID(),
    experimentType: "network-partition",
    targetService: "payment-service",
    description: "Partition the payment service",
    expectedFailureMode: "timeouts",
    severity: 3,
    passCriteria: "graceful degradation",
    failCriteria: "request pile-up",
    estimatedDurationSeconds: 60,
    claudeConfidence: 0.9,
    geminiConfidence: 0.8,
    consensusScore: 0.85,
    ...overrides,
  };
}

function makeResult(overrides: Partial<ExperimentResult>): ExperimentResult {
  return {
    hypothesisId: "hyp-1",
    passed: true,
    failureDetected: false,
    metrics: {
      p50LatencyMs: 10,
      p99LatencyMs: 20,
      errorRate: 0,
      cpuUsage: 5,
      memoryUsage: 10,
      recoveryTimeSeconds: 10,
    },
    logs: "",
    durationSeconds: 60,
    rawOutput: "",
    ...overrides,
  };
}

describe("computeResilienceScore", () => {
  it("returns 100 when all experiments pass", () => {
    const hypothesis = makeHypothesis({ id: "hyp-1", severity: 2 });
    const result = makeResult({ hypothesisId: "hyp-1" });

    const score = computeResilienceScore([result], [hypothesis]);

    expect(score.overall).toBe(100);
    expect(score.failed).toBe(0);
    expect(score.recommendation).toBe("deploy");
  });

  it("deducts severity-specific penalties", () => {
    const hypothesis = makeHypothesis({ id: "hyp-2", severity: 5 });
    const result = makeResult({
      hypothesisId: "hyp-2",
      passed: false,
      failureDetected: true,
      failureDescription: "Requests timed out",
      metrics: {
        p50LatencyMs: 10,
        p99LatencyMs: 20,
        errorRate: 0.5,
        cpuUsage: 50,
        memoryUsage: 200,
        recoveryTimeSeconds: 45,
      },
    });

    const score = computeResilienceScore([result], [hypothesis]);

    expect(score.overall).toBe(75);
    expect(score.criticalFailures).toHaveLength(1);
    expect(score.recommendation).toBe("deploy");
  });

  it("applies the fast recovery bonus", () => {
    const hypothesis = makeHypothesis({ id: "hyp-3", severity: 4 });
    const result = makeResult({
      hypothesisId: "hyp-3",
      passed: false,
      failureDetected: true,
      failureDescription: "Recovered quickly",
      metrics: {
        p50LatencyMs: 10,
        p99LatencyMs: 20,
        errorRate: 0.2,
        cpuUsage: 20,
        memoryUsage: 40,
        recoveryTimeSeconds: 12,
      },
    });

    const score = computeResilienceScore([result], [hypothesis]);

    expect(score.overall).toBe(90);
  });

  it("blocks deployment when score is below threshold and recommendation is critical", () => {
    const hypotheses = [
      makeHypothesis({ id: "hyp-4", severity: 5, targetService: "billing" }),
      makeHypothesis({ id: "hyp-5", severity: 5, targetService: "payments" }),
    ];
    const results = [
      makeResult({
        hypothesisId: "hyp-4",
        passed: false,
        failureDetected: true,
        failureDescription: "Outage",
        metrics: {
          p50LatencyMs: 10,
          p99LatencyMs: 20,
          errorRate: 1,
          cpuUsage: 50,
          memoryUsage: 150,
          recoveryTimeSeconds: 120,
        },
      }),
      makeResult({
        hypothesisId: "hyp-5",
        passed: false,
        failureDetected: true,
        failureDescription: "Cascading failure",
        metrics: {
          p50LatencyMs: 10,
          p99LatencyMs: 20,
          errorRate: 1,
          cpuUsage: 70,
          memoryUsage: 180,
          recoveryTimeSeconds: 150,
        },
      }),
    ];

    const score = computeResilienceScore(results, hypotheses);

    expect(score.overall).toBe(50);
    expect(score.deploymentAllowed).toBe(false);
    expect(score.recommendation).toBe("do-not-deploy");
  });
});
