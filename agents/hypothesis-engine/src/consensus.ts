import { type Hypothesis } from "@vorth/shared-types";

function hypothesisKey(hypothesis: Hypothesis) {
  return `${hypothesis.experimentType}:${hypothesis.targetService}:${hypothesis.targetFunction ?? ""}`;
}

export function buildConsensus(claudeHypotheses: Hypothesis[], geminiHypotheses: Hypothesis[]) {
  const geminiMap = new Map(geminiHypotheses.map((hypothesis) => [hypothesisKey(hypothesis), hypothesis]));
  const merged: Hypothesis[] = [];

  for (const claudeHypothesis of claudeHypotheses) {
    const match = geminiMap.get(hypothesisKey(claudeHypothesis));

    if (match) {
      merged.push({
        ...claudeHypothesis,
        geminiConfidence: match.geminiConfidence,
        consensusScore: Number(
          (((claudeHypothesis.claudeConfidence + match.geminiConfidence) / 2 + claudeHypothesis.consensusScore + match.consensusScore) / 3).toFixed(3),
        ),
      });
      continue;
    }

    if (claudeHypothesis.severity >= 4) {
      merged.push({
        ...claudeHypothesis,
        geminiConfidence: 0,
        consensusScore: Number(((claudeHypothesis.claudeConfidence + claudeHypothesis.consensusScore) / 2).toFixed(3)),
      });
    }
  }

  return merged.sort((left, right) => right.severity - left.severity || right.consensusScore - left.consensusScore);
}
