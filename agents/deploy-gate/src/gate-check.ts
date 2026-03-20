import "dotenv-safe/config.js";

import { createGitLabClient, postCommitStatus, postMergeRequestComment } from "@vorth/gitlab-client";
import { fetchLatestScore } from "@vorth/mcp-tools";

export async function runGateCheck(projectId: number, mrId: number, environment: string) {
  const client = createGitLabClient();
  const score = await fetchLatestScore(projectId, mrId);
  const sha = process.env.CI_COMMIT_SHA;

  if (!score) {
    const message = `Vorth deploy gate: no resilience score found for MR !${mrId}; allowing ${environment} deployment with caveat.`;
    if (sha) {
      await postCommitStatus(client, projectId, sha, "success", "vorth/deploy-gate", message);
    }
    await postMergeRequestComment(client, projectId, mrId, message);
    return {
      exitCode: 0,
      allowed: true,
      reason: message,
    };
  }

  if (score.overall >= Number(process.env.MIN_RESILIENCE_SCORE ?? "70")) {
    const message = `Vorth deploy gate passed: resilience score ${score.overall}/100 allows ${environment} deployment.`;
    if (sha) {
      await postCommitStatus(client, projectId, sha, "success", "vorth/deploy-gate", message, score.fix_mr_url ?? undefined);
    }
    await postMergeRequestComment(client, projectId, mrId, message);
    return {
      exitCode: 0,
      allowed: true,
      reason: message,
      score,
    };
  }

  if (score.recommendation === "do-not-deploy") {
    const message = `Vorth deploy gate blocked: resilience score ${score.overall}/100 is below threshold and recommendation is do-not-deploy.${score.fix_mr_url ? ` Fix MR: ${score.fix_mr_url}` : ""}`;
    if (sha) {
      await postCommitStatus(client, projectId, sha, "failed", "vorth/deploy-gate", message, score.fix_mr_url ?? undefined);
    }
    await postMergeRequestComment(client, projectId, mrId, message);
    return {
      exitCode: 1,
      allowed: false,
      reason: message,
      score,
    };
  }

  const message = `Vorth deploy gate warning: resilience score ${score.overall}/100 is below threshold, but recommendation is ${score.recommendation}. Allowing ${environment} deployment with caveat.`;
  if (sha) {
    await postCommitStatus(client, projectId, sha, "success", "vorth/deploy-gate", message, score.fix_mr_url ?? undefined);
  }
  await postMergeRequestComment(client, projectId, mrId, message);
  return {
    exitCode: 0,
    allowed: true,
    reason: message,
    score,
  };
}
