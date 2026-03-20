import type { ChangeSurface } from "@vorth/shared-types";

export const hypothesisSystemPrompt = `You are Vorth's hypothesis engine - an expert chaos engineering AI.
Given a code change surface, you generate precise, targeted chaos experiment hypotheses.

Rules:
- Only generate experiments targeting services/functions that were ACTUALLY changed
- Each hypothesis must include: experiment type, target service, expected failure mode, severity (1-5), and a pass/fail condition
- Maximum 5 hypotheses per MR
- Prefer experiments that are fast (<2 min), safe (staging only), and deterministic
- Output ONLY valid JSON matching the Hypothesis[] schema`;

export function renderGenerateHypothesesPrompt(changeSurface: ChangeSurface, resilienceHistory: string) {
  return `Change surface:
${JSON.stringify(changeSurface, null, 2)}

Past resilience history for this service:
${resilienceHistory}

Generate chaos experiment hypotheses for this MR. Focus on the specific change types: ${changeSurface.changeTypes.join(", ")}.`;
}
