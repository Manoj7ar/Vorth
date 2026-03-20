import { describe, expect, it } from "vitest";

import type { Hypothesis } from "@vorth/shared-types";

import { buildConsensus } from "./consensus.js";

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
    estimatedDurationSeconds: 90,
    claudeConfidence: 0.9,
    geminiConfidence: 0.8,
    consensusScore: 0.85,
    ...overrides,
  };
}

describe("buildConsensus", () => {
  it("keeps hypotheses both models agree on", () => {
    const claude = [makeHypothesis({ id: "a" })];
    const gemini = [makeHypothesis({ id: "b" })];

    const result = buildConsensus(claude, gemini);

    expect(result).toHaveLength(1);
    expect(result[0]?.targetService).toBe("payment-service");
    expect(result[0]?.experimentType).toBe("network-partition");
    expect(result[0]?.geminiConfidence).toBe(0.8);
  });

  it("keeps Claude-only severe hypotheses", () => {
    const claude = [makeHypothesis({ id: "critical", severity: 4, targetService: "db-client" })];

    const result = buildConsensus(claude, []);

    expect(result).toHaveLength(1);
    expect(result[0]?.targetService).toBe("db-client");
    expect(result[0]?.geminiConfidence).toBe(0);
  });

  it("drops Gemini-only hypotheses", () => {
    const gemini = [makeHypothesis({ id: "gemini-only", targetService: "cache-service" })];

    const result = buildConsensus([], gemini);

    expect(result).toHaveLength(0);
  });

  it("sorts by severity descending", () => {
    const claude = [
      makeHypothesis({ id: "low", severity: 4, targetService: "service-a" }),
      makeHypothesis({ id: "high", severity: 5, targetService: "service-b" }),
    ];

    const result = buildConsensus(claude, []);

    expect(result.map((item) => item.targetService)).toEqual(["service-b", "service-a"]);
  });
});
