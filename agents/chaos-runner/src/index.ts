import "dotenv-safe/config.js";

import { fileURLToPath } from "node:url";

import pino from "pino";
import { execa } from "execa";

import { createGitLabClient } from "@vorth/gitlab-client";
import { postMrNote, storeExperimentResults } from "@vorth/mcp-tools";
import { hypothesisListSchema, type ExperimentResult, type Hypothesis, webhookPayloadSchema } from "@vorth/shared-types";

import { deployServicesToNamespace, getTargetPod, provisionEphemeralNamespace, teardownNamespace } from "./gke/cluster.js";
import { runCpuStress } from "./experiments/cpu-stress.js";
import { runDependencyFailure } from "./experiments/dependency-failure.js";
import { runLatencyInjection } from "./experiments/latency-injection.js";
import { runMemoryStress } from "./experiments/memory-stress.js";
import { runNetworkPartition } from "./experiments/network-partition.js";

const logger = pino({ name: "vorth-chaos-runner" });

async function collectMetrics(namespace: string, pod: string) {
  const result = await execa("kubectl", ["top", "pod", pod, "-n", namespace, "--no-headers"], {
    reject: false,
  });

  const [name, cpuUsage = "0m", memoryUsage = "0Mi"] = result.stdout.trim().split(/\s+/);
  void name;

  return {
    p50LatencyMs: 0,
    p99LatencyMs: 0,
    errorRate: 0,
    cpuUsage: Number.parseInt(cpuUsage.replace("m", ""), 10) || 0,
    memoryUsage: Number.parseInt(memoryUsage.replace("Mi", ""), 10) || 0,
  };
}

async function runExperiment(namespace: string, hypothesis: Hypothesis): Promise<ExperimentResult> {
  const targetPod = await getTargetPod(namespace, hypothesis.targetService);
  const startedAt = Date.now();
  let rawOutput = "";

  try {
    switch (hypothesis.experimentType) {
      case "network-partition":
        rawOutput = await runNetworkPartition({
          namespace,
          targetPod,
          targetPort: 80,
          durationSeconds: hypothesis.estimatedDurationSeconds,
        });
        break;
      case "latency-injection":
        rawOutput = await runLatencyInjection({
          namespace,
          targetContainer: targetPod,
          latencyMs: 500,
          jitterMs: 100,
          durationSeconds: hypothesis.estimatedDurationSeconds,
        });
        break;
      case "cpu-stress":
        rawOutput = await runCpuStress({
          namespace,
          targetPod,
          durationSeconds: hypothesis.estimatedDurationSeconds,
        });
        break;
      case "memory-stress":
        rawOutput = await runMemoryStress({
          namespace,
          targetPod,
          durationSeconds: hypothesis.estimatedDurationSeconds,
        });
        break;
      case "dependency-failure":
        rawOutput = await runDependencyFailure({
          namespace,
          dependencyService: hypothesis.targetService,
          durationSeconds: hypothesis.estimatedDurationSeconds,
        });
        break;
    }

    const metrics = await collectMetrics(namespace, targetPod);

    return {
      hypothesisId: hypothesis.id,
      passed: true,
      failureDetected: false,
      metrics,
      logs: rawOutput,
      durationSeconds: Math.ceil((Date.now() - startedAt) / 1000),
      rawOutput,
    };
  } catch (error) {
    const metrics = await collectMetrics(namespace, targetPod).catch(() => ({
      p50LatencyMs: 0,
      p99LatencyMs: 0,
      errorRate: 1,
      cpuUsage: 0,
      memoryUsage: 0,
    }));

    return {
      hypothesisId: hypothesis.id,
      passed: false,
      failureDetected: true,
      failureDescription: error instanceof Error ? error.message : "Chaos experiment failed",
      metrics,
      logs: rawOutput,
      durationSeconds: Math.ceil((Date.now() - startedAt) / 1000),
      rawOutput,
    };
  }
}

async function safeFailureComment(projectId: number, mrId: number, error: unknown) {
  try {
    await postMrNote(
      createGitLabClient(),
      projectId,
      mrId,
      `Vorth could not complete the chaos experiments for this MR.\n\n\`${error instanceof Error ? error.message : "Unknown error"}\``,
    );
  } catch (commentError) {
    logger.error({ err: commentError }, "failed to post fallback chaos comment");
  }
}

export async function runChaosRunner(input: {
  payload: unknown;
  hypotheses: Hypothesis[];
  hypothesisBatchId: string;
}) {
  const payload = webhookPayloadSchema.parse(input.payload);
  const hypotheses = hypothesisListSchema.parse(input.hypotheses);
  const mr = payload.merge_request ?? payload.object_attributes;

  if (!mr?.iid) {
    throw new Error("Merge request IID is missing from the webhook payload.");
  }

  const namespace = await provisionEphemeralNamespace(mr.iid);

  try {
    await deployServicesToNamespace(
      namespace,
      [...new Set(hypotheses.map((hypothesis) => hypothesis.targetService))],
    );

    const results: ExperimentResult[] = [];

    for (const hypothesis of hypotheses) {
      results.push(await runExperiment(namespace, hypothesis));
    }

    await storeExperimentResults(input.hypothesisBatchId, results);
    return {
      namespace,
      results,
    };
  } catch (error) {
    logger.error({ err: error, projectId: payload.project.id, mrId: mr.iid }, "chaos runner failed");
    await safeFailureComment(payload.project.id, mr.iid, error);
    throw error;
  } finally {
    await teardownNamespace(namespace);
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
    hypotheses: Hypothesis[];
    hypothesisBatchId: string;
  };
  const result = await runChaosRunner(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    logger.error({ err: error }, "fatal chaos runner error");
    process.exitCode = 1;
  });
}
