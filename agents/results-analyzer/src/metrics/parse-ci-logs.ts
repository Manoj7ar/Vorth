export function parseCiLogs(logs: string) {
  const timeoutMatches = logs.match(/timeout/gi)?.length ?? 0;
  const errorMatches = logs.match(/error/gi)?.length ?? 0;
  const latencyMatches = logs.match(/(\d+)ms/g) ?? [];

  return {
    timeoutCount: timeoutMatches,
    errorCount: errorMatches,
    observedLatencyMs: latencyMatches.map((match) => Number.parseInt(match.replace("ms", ""), 10)),
  };
}
