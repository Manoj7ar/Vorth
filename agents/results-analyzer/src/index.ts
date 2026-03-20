import "dotenv-safe/config.js";

import { fileURLToPath } from "node:url";

import pino from "pino";

import { createGitLabClient } from "@vorth/gitlab-client";
import { postMrNote, storeResilienceScore } from "@vorth/mcp-tools";
import { experimentResultListSchema, hypothesisListSchema, webhookPayloadSchema } from "@vorth/shared-types";

import { analyzeResultsNarrative } from "./claude-analyzer.js";
import { readCloudMonitoringMetrics } from "./metrics/cloud-monitoring.js";
import { parseCiLogs } from "./metrics/parse-ci-logs.js";
import { computeResilienceScore } from "./scorer.js";

const logger = pino({ name: "vorth-results-analyzer" });

function formatResultsComment(params: {
  score: ReturnType<typeof computeResilienceScore>;
  results: ReturnType<typeof experimentResultListSchema.parse>;
  hypotheses: ReturnType<typeof hypothesisListSchema.parse>;
  narrative: string;
}) {
  const rows = params.results
    .map((result) => {
      const hypothesis = params.hypotheses.find((item) => item.id === result.hypothesisId);
      const label = hypothesis ? `${hypothesis.experimentType} - ${hypothesis.targetService}` : result.hypothesisId;
      const details = result.passed
        ? `Recovered in ${result.metrics.recoveryTimeSeconds ?? 0}s`
        : result.failureDescription ?? "Failure detected";
      return `| ${label} | ${result.passed ? "PASSED" : "FAILED"} | ${details} |`;
    })
    .join("\n");

  return `## Vorth Resilience Report

**Score: ${params.score.overall}/100**  ${params.score.deploymentAllowed ? "Deployment allowed" : "Deployment blocked"}

### Results
| Experiment | Result | Details |
|-----------|--------|---------|
${rows}

### Claude's Analysis
${params.narrative}

_Next: ${params.score.failed > 0 ? "Vorth will open a fix MR automatically..." : "No fix MR required."}_`;
}

async function safeFailureComment(projectId: number, mrId: number, error: unknown) {
  try {
    await postMrNote(
      createGitLabClient(),
      projectId,
      mrId,
      `Vorth could not analyze the chaos experiment results.\n\n\`${error instanceof Error ? error.message : "Unknown error"}\``,
    );
  } catch (commentError) {
    logger.error({ err: commentError }, "failed to post fallback results comment");
  }
}

export async function runResultsAnalyzer(input: {
  payload: unknown;
  hypotheses: unknown;
  results: unknown;
}) {
  const payload = webhookPayloadSchema.parse(input.payload);
  const hypotheses = hypothesisListSchema.parse(input.hypotheses);
  const results = experimentResultListSchema.parse(input.results);
  const mr = payload.merge_request ?? payload.object_attributes;

  if (!mr?.iid) {
    throw new Error("Merge request IID is missing from the webhook payload.");
  }

  try {
    const score = computeResilienceScore(results, hypotheses);
    const metrics = await Promise.all(
      [...new Set(hypotheses.map((hypothesis) => hypothesis.targetService))].map((service) =>
        readCloudMonitoringMetrics(process.env.GOOGLE_CLOUD_PROJECT_ID ?? "", service).catch(() => []),
      ),
    );
    const logSummary = results.map((result) => parseCiLogs(result.logs));
    void metrics;
    void logSummary;

    const narrative = await analyzeResultsNarrative(results, hypotheses, score);

    await storeResilienceScore({
      gitlabProjectId: payload.project.id,
      mrId: mr.iid,
      score,
      claudeAnalysis: narrative,
    });

    await postMrNote(
      createGitLabClient(),
      payload.project.id,
      mr.iid,
      formatResultsComment({ score, results, hypotheses, narrative }),
    );

    return {
      score,
      narrative,
      results,
    };
  } catch (error) {
    logger.error({ err: error, projectId: payload.project.id, mrId: mr.iid }, "results analyzer failed");
    await safeFailureComment(payload.project.id, mr.iid, error);
    throw error;
  }
}

async function readStdin() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  const payload = JSON.parse(raw || "{}") as {
    payload: unknown;
    hypotheses: unknown;
    results: unknown;
  };
  const result = await runResultsAnalyzer(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    logger.error({ err: error }, "fatal results analyzer error");
    process.exitCode = 1;
  });
}
