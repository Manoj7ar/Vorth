import type { ChangeSurface } from "@vorth/shared-types";

export const geminiValidationSystemPrompt = `You are Vorth's validation engine for chaos experiment planning.
Validate whether each proposed experiment is truly aligned to the observed code changes.

Rules:
- Prefer only experiments tied to actually changed services or functions
- Reject broad or generic chaos plans
- Output ONLY valid JSON matching the Hypothesis[] schema`;

export function renderValidateHypothesesPrompt(changeSurface: ChangeSurface, resilienceHistory: string) {
  return `Change surface:
${JSON.stringify(changeSurface, null, 2)}

Past resilience history for this service:
${resilienceHistory}

Generate a validation pass of targeted chaos experiment hypotheses for this MR.`;
}
