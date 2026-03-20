import "dotenv-safe/config.js";

import { fileURLToPath } from "node:url";

import pino from "pino";

import { createGitLabClient } from "@vorth/gitlab-client";
import { postMrNote, queryResilienceHistory, storeHypotheses } from "@vorth/mcp-tools";
import { changeSurfaceSchema, type ChangeSurface, type Hypothesis, webhookPayloadSchema, type WebhookPayload } from "@vorth/shared-types";

import { generateClaudeHypotheses } from "./claude-client.js";
import { buildConsensus } from "./consensus.js";
import { generateGeminiHypotheses } from "./gemini-client.js";

const logger = pino({ name: "vorth-hypothesis-engine" });

function getMergeRequest(payload: WebhookPayload) {
  return payload.merge_request ?? payload.object_attributes;
}

function formatPlanComment(hypotheses: Hypothesis[]) {
  const rows = hypotheses
    .map(
      (hypothesis, index) =>
        `| ${index + 1} | ${hypothesis.experimentType.replace("-", " ")} | ${hypothesis.targetService} | ${hypothesis.severity}/5 | ${hypothesis.estimatedDurationSeconds}s |`,
    )
    .join("\n");

  return `## Vorth Resilience Plan

I've analyzed the changes in this MR and generated **${hypotheses.length} chaos experiments** targeting your specific changes.

| # | Experiment | Target | Severity | Duration |
|---|-----------|--------|----------|----------|
${rows}

**Approve this plan to run experiments:**
- Reply with \`/vorth run\` to execute all experiments
- Reply with \`/vorth skip\` to bypass resilience testing (requires reason)

_Powered by Claude + Gemini consensus engine_`;
}

async function safeFailureComment(projectId: number, mrId: number, error: unknown) {
  try {
    await postMrNote(
      createGitLabClient(),
      projectId,
      mrId,
      `Vorth could not generate a resilience experiment plan for this MR.\n\n\`${error instanceof Error ? error.message : "Unknown error"}\``,
    );
  } catch (commentError) {
    logger.error({ err: commentError }, "failed to post fallback hypothesis comment");
  }
}

export async function runHypothesisEngine(input: {
  payload: unknown;
  changeSurface: ChangeSurface;
}) {
  const payload = webhookPayloadSchema.parse(input.payload);
  const changeSurface = changeSurfaceSchema.parse(input.changeSurface);
  const mergeRequest = getMergeRequest(payload);

  if (!mergeRequest?.iid) {
    throw new Error("Merge request IID is missing from the webhook payload.");
  }

  const projectId = payload.project.id;
  const mrId = mergeRequest.iid;

  try {
    const resilienceHistory = await queryResilienceHistory(projectId, changeSurface.changedServices);
    const [{ hypotheses: claudeHypotheses, raw: claudeRaw }, { hypotheses: geminiHypotheses, raw: geminiRaw }] = await Promise.all([
      generateClaudeHypotheses(changeSurface, resilienceHistory),
      generateGeminiHypotheses(changeSurface, resilienceHistory),
    ]);

    const hypotheses = buildConsensus(claudeHypotheses, geminiHypotheses).slice(
      0,
      Number(process.env.MAX_EXPERIMENTS_PER_MR ?? "5"),
    );

    const storage = await storeHypotheses({
      gitlabProjectId: projectId,
      projectName: payload.project.name,
      projectNamespace: payload.project.path_with_namespace,
      mrId,
      title: mergeRequest.title ?? "Untitled MR",
      author: payload.user?.username ?? payload.user?.name ?? "unknown",
      sourceBranch: mergeRequest.source_branch ?? "unknown",
      hypotheses,
      claudeRaw: JSON.parse(claudeRaw),
      geminiRaw: JSON.parse(geminiRaw),
      consensusRaw: hypotheses,
    });

    await postMrNote(createGitLabClient(), projectId, mrId, formatPlanComment(hypotheses));

    return {
      hypotheses,
      autoRun: hypotheses.every((hypothesis) => hypothesis.severity < 3),
      hypothesisBatchId: storage.hypothesisBatchId,
      claudeRaw: JSON.parse(claudeRaw),
      geminiRaw: JSON.parse(geminiRaw),
    };
  } catch (error) {
    logger.error({ err: error, projectId, mrId }, "hypothesis engine failed");
    await safeFailureComment(projectId, mrId, error);
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
  const payload = JSON.parse(raw || "{}") as { payload: WebhookPayload; changeSurface: ChangeSurface };
  const result = await runHypothesisEngine(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    logger.error({ err: error }, "fatal hypothesis engine error");
    process.exitCode = 1;
  });
}
