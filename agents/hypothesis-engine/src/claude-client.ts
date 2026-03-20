import "dotenv-safe/config.js";

import Anthropic from "@anthropic-ai/sdk";

import { hypothesisListSchema, type ChangeSurface, type Hypothesis } from "@vorth/shared-types";

import { hypothesisSystemPrompt, renderGenerateHypothesesPrompt } from "./prompts/generate-hypotheses.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function extractText(content: Anthropic.Messages.Message["content"]) {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function generateClaudeHypotheses(changeSurface: ChangeSurface, resilienceHistory: string): Promise<{
  hypotheses: Hypothesis[];
  raw: string;
}> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    system: hypothesisSystemPrompt,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: renderGenerateHypothesesPrompt(changeSurface, resilienceHistory),
      },
    ],
  });

  const raw = extractText(response.content);
  const parsed = hypothesisListSchema.parse(JSON.parse(raw));

  return {
    hypotheses: parsed,
    raw,
  };
}
