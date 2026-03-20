import "dotenv-safe/config.js";

import { VertexAI } from "@google-cloud/vertexai";

import { hypothesisListSchema, type ChangeSurface, type Hypothesis } from "@vorth/shared-types";

import { geminiValidationSystemPrompt, renderValidateHypothesesPrompt } from "./prompts/validate-hypotheses.js";

const vertexAi = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID ?? "",
  location: process.env.VERTEX_AI_LOCATION ?? "us-central1",
});

export async function generateGeminiHypotheses(changeSurface: ChangeSurface, resilienceHistory: string): Promise<{
  hypotheses: Hypothesis[];
  raw: string;
}> {
  const model = vertexAi.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
    systemInstruction: {
      role: "system",
      parts: [{ text: geminiValidationSystemPrompt }],
    },
  });

  const response = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: renderValidateHypothesesPrompt(changeSurface, resilienceHistory) }],
      },
    ],
  });

  const raw = response.response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "[]";
  const parsed = hypothesisListSchema.parse(JSON.parse(raw));

  return {
    hypotheses: parsed,
    raw,
  };
}
