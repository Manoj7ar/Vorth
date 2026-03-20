import "dotenv-safe/config.js";

import Anthropic from "@anthropic-ai/sdk";

import { type ExperimentResult, type Hypothesis } from "@vorth/shared-types";

import { generateBulkheadTemplate } from "./patterns/bulkhead.js";
import { generateCircuitBreakerWrapper } from "./patterns/circuit-breaker.js";
import { generateRetryLogicTemplate } from "./patterns/retry-logic.js";
import { generateTimeoutTemplate } from "./patterns/timeout.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function extractText(content: Anthropic.Messages.Message["content"]) {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function renderPrompt(input: {
  filePath: string;
  source: string;
  hypothesis: Hypothesis;
  result: ExperimentResult;
  analysis: string;
}) {
  return `You are Vorth's fix engineer. Given:
- The original source file
- The chaos experiment failure
- The analysis

Write the minimal code change to fix this resilience issue.

Requirements:
- Use the circuit-breaker pattern if the failure was a dependency timeout
- Use exponential backoff if the failure was a retry storm
- Add proper timeout if missing
- Do NOT refactor unrelated code
- Output a unified diff patch ONLY

Reference patterns:
Circuit breaker:
${generateCircuitBreakerWrapper(input.hypothesis.targetFunction ?? "callDependency", {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
})}

Retry:
${generateRetryLogicTemplate(input.hypothesis.targetFunction ?? "operation")}

Timeout:
${generateTimeoutTemplate(5000)}

Bulkhead:
${generateBulkheadTemplate(5)}

File path: ${input.filePath}
Hypothesis:
${JSON.stringify(input.hypothesis, null, 2)}

Experiment result:
${JSON.stringify(input.result, null, 2)}

Analysis:
${input.analysis}

Original source:
\`\`\`ts
${input.source}
\`\`\``;
}

export async function generateFixPatch(input: {
  filePath: string;
  source: string;
  hypothesis: Hypothesis;
  result: ExperimentResult;
  analysis: string;
}) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: renderPrompt(input),
      },
    ],
  });

  return extractText(response.content);
}
