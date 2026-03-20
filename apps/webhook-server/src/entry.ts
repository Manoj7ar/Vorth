import "dotenv-safe/config.js";

import pino from "pino";

import { runChaosRunner } from "@vorth/chaos-runner";
import { runDiffAnalyzer } from "@vorth/diff-analyzer";
import { runFixWriter } from "@vorth/fix-writer";
import { runHypothesisEngine } from "@vorth/hypothesis-engine";
import { runResultsAnalyzer } from "@vorth/results-analyzer";
import { webhookPayloadSchema } from "@vorth/shared-types";

const logger = pino({ name: "vorth-entry" });

async function main() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const payload = webhookPayloadSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const changeSurface = await runDiffAnalyzer(payload);
  const plan = await runHypothesisEngine({ payload, changeSurface });
  const noteBody = payload.object_attributes?.note ?? "";

  if (!noteBody.includes("/vorth run") && !plan.autoRun) {
    logger.info("plan posted; waiting for /vorth run");
    return;
  }

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
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exitCode = 1;
});
