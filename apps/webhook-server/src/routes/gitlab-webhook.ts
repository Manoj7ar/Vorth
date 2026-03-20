import type { Request, Response } from "express";

import pino from "pino";

import { runChaosRunner } from "@vorth/chaos-runner";
import { runDiffAnalyzer } from "@vorth/diff-analyzer";
import { runFixWriter } from "@vorth/fix-writer";
import { postMergeRequestComment } from "@vorth/gitlab-client";
import { runHypothesisEngine } from "@vorth/hypothesis-engine";
import { createGitLabClient } from "@vorth/gitlab-client";
import { runResultsAnalyzer } from "@vorth/results-analyzer";
import { webhookPayloadSchema } from "@vorth/shared-types";

const logger = pino({ name: "vorth-webhook-route" });

async function orchestrateFullRun(payload: unknown) {
  const changeSurface = await runDiffAnalyzer(payload);
  const plan = await runHypothesisEngine({ payload, changeSurface });
  const chaos = await runChaosRunner({
    payload,
    hypotheses: plan.hypotheses,
    hypothesisBatchId: plan.hypothesisBatchId,
  });
  const analysis = await runResultsAnalyzer({
    payload,
    hypotheses: plan.hypotheses,
    results: chaos.results,
  });

  let fix = { fixMrUrl: undefined as string | undefined };
  if (analysis.score.failed > 0) {
    fix = await runFixWriter({
      payload,
      changeSurface,
      hypotheses: plan.hypotheses,
      results: chaos.results,
      narrative: analysis.narrative,
    });
  }

  return {
    changeSurface,
    plan,
    chaos,
    analysis,
    fix,
  };
}

export async function gitLabWebhookRoute(request: Request, response: Response) {
  try {
    const payload = webhookPayloadSchema.parse(request.body);
    const mr = payload.merge_request ?? payload.object_attributes;
    const noteBody = payload.object_attributes?.note ?? "";
    const eventAction = payload.object_attributes?.action ?? payload.merge_request?.action ?? "";

    if (payload.object_kind === "merge_request" && ["open", "opened", "update", "updated"].includes(eventAction)) {
      const changeSurface = await runDiffAnalyzer(payload);
      const plan = await runHypothesisEngine({ payload, changeSurface });

      if (plan.autoRun) {
        const chaos = await runChaosRunner({
          payload,
          hypotheses: plan.hypotheses,
          hypothesisBatchId: plan.hypothesisBatchId,
        });
        const analysis = await runResultsAnalyzer({
          payload,
          hypotheses: plan.hypotheses,
          results: chaos.results,
        });

        if (analysis.score.failed > 0) {
          await runFixWriter({
            payload,
            changeSurface,
            hypotheses: plan.hypotheses,
            results: chaos.results,
            narrative: analysis.narrative,
          });
        }

        response.status(202).json({
          status: "auto-ran",
          changeSurface,
          plan,
          analysis,
        });
        return;
      }

      response.status(202).json({
        status: "planned",
        changeSurface,
        plan,
      });
      return;
    }

    if (payload.object_kind === "note" && noteBody.includes("/vorth run")) {
      const result = await orchestrateFullRun(payload);
      response.status(202).json({
        status: "executed",
        ...result,
      });
      return;
    }

    if (payload.object_kind === "note" && noteBody.includes("/vorth skip")) {
      if (mr?.iid) {
        await postMergeRequestComment(
          createGitLabClient(),
          payload.project.id,
          mr.iid,
          "Vorth resilience testing was skipped for this MR. Please include a reason in the comment thread for auditability.",
        );
      }

      response.status(202).json({
        status: "skipped",
      });
      return;
    }

    response.status(202).json({
      status: "ignored",
    });
  } catch (error) {
    logger.error({ err: error }, "webhook handling failed");
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
