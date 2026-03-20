import "dotenv-safe/config.js";

import Anthropic from "@anthropic-ai/sdk";

import { type ExperimentResult, type Hypothesis, type ResilienceScore } from "@vorth/shared-types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function renderPrompt(results: ExperimentResult[], hypotheses: Hypothesis[], score: ResilienceScore) {
  return `You are Vorth's results analyst. Given these chaos experiment results, write:
1. A 2-3 sentence summary of the overall resilience finding
2. For each FAILED experiment: the likely root cause in the code, and a specific fix recommendation (with code snippet if possible)
3. A confidence rating for each recommendation

Be specific. Reference actual function names and services from the diff. Do not be generic.

Resilience score:
${JSON.stringify(score, null, 2)}

Hypotheses:
${JSON.stringify(hypotheses, null, 2)}

Experiment results:
${JSON.stringify(results, null, 2)}`;
}

function extractText(content: Anthropic.Messages.Message["content"]) {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function analyzeResultsNarrative(results: ExperimentResult[], hypotheses: Hypothesis[], score: ResilienceScore) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: renderPrompt(results, hypotheses, score),
      },
    ],
  });

  return extractText(response.content);
}
