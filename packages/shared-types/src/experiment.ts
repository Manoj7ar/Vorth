import { z } from "zod";

export const experimentMetricsSchema = z.object({
  p50LatencyMs: z.number().nonnegative(),
  p99LatencyMs: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  cpuUsage: z.number().nonnegative(),
  memoryUsage: z.number().nonnegative(),
  recoveryTimeSeconds: z.number().int().nonnegative().optional(),
});

export const experimentResultSchema = z.object({
  hypothesisId: z.string(),
  passed: z.boolean(),
  failureDetected: z.boolean(),
  failureDescription: z.string().optional(),
  metrics: experimentMetricsSchema,
  logs: z.string(),
  durationSeconds: z.number().int().nonnegative(),
  rawOutput: z.string(),
});

export const experimentResultListSchema = z.array(experimentResultSchema);

export type ExperimentMetrics = z.infer<typeof experimentMetricsSchema>;
export type ExperimentResult = z.infer<typeof experimentResultSchema>;
