import "dotenv-safe/config.js";

import { fileURLToPath } from "node:url";

import pino from "pino";

import { createGitLabClient } from "@vorth/gitlab-client";
import { postMrNote, saveChangeSurface } from "@vorth/mcp-tools";
import { webhookPayloadSchema, type ChangeSurface, type WebhookPayload } from "@vorth/shared-types";

import { buildChangeSurface } from "./tools/extract-change-surface.js";
import { identifyServices } from "./tools/identify-services.js";
import { readDiff } from "./tools/read-diff.js";

const logger = pino({ name: "vorth-diff-analyzer" });

function getMergeRequest(payload: WebhookPayload) {
  return payload.merge_request ?? payload.object_attributes;
}

async function safeFailureComment(projectId: number | undefined, mrId: number | undefined, error: unknown) {
  if (!projectId || !mrId) {
    return;
  }

  try {
    const client = createGitLabClient();
    await postMrNote(
      client,
      projectId,
      mrId,
      `Vorth could not analyze this MR for resilience testing.\n\n\`${error instanceof Error ? error.message : "Unknown error"}\``,
    );
  } catch (commentError) {
    logger.error({ err: commentError }, "failed to post fallback MR comment");
  }
}

export async function runDiffAnalyzer(payload: unknown): Promise<ChangeSurface> {
  const parsedPayload = webhookPayloadSchema.parse(payload);
  const mergeRequest = getMergeRequest(parsedPayload);
  const projectId = parsedPayload.project.id;
  const mrId = mergeRequest?.iid;

  try {
    if (!mergeRequest?.iid) {
      throw new Error("Merge request IID is missing from the webhook payload.");
    }

    const client = createGitLabClient();
    await postMrNote(client, projectId, mergeRequest.iid, "Vorth is analyzing this MR for resilience testing...");

    const diff = await readDiff(projectId, mergeRequest.iid);
    const changeSurface = buildChangeSurface({
      mrId: mergeRequest.iid,
      projectId,
      changes: diff.changes,
    });

    changeSurface.changedServices = identifyServices(changeSurface.changedFiles);

    await saveChangeSurface({
      gitlabProjectId: projectId,
      projectName: parsedPayload.project.name,
      projectNamespace: parsedPayload.project.path_with_namespace,
      mrId: mergeRequest.iid,
      title: mergeRequest.title ?? diff.title,
      author: parsedPayload.user?.username ?? parsedPayload.user?.name ?? "unknown",
      sourceBranch: mergeRequest.source_branch ?? "unknown",
      changeSurface,
    });

    logger.info(
      {
        projectId,
        mrId: mergeRequest.iid,
        changedServices: changeSurface.changedServices,
        riskLevel: changeSurface.riskLevel,
      },
      "change surface extracted",
    );

    return changeSurface;
  } catch (error) {
    logger.error({ err: error, projectId, mrId }, "diff analyzer failed");
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
  const payload = JSON.parse(raw || "{}");
  const result = await runDiffAnalyzer(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    logger.error({ err: error }, "fatal diff analyzer error");
    process.exitCode = 1;
  });
}
