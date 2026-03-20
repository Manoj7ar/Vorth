import { z } from "zod";

export const experimentTypeSchema = z.enum([
  "network-partition",
  "latency-injection",
  "cpu-stress",
  "memory-stress",
  "dependency-failure",
]);

export const severitySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const hypothesisSchema = z.object({
  id: z.string(),
  experimentType: experimentTypeSchema,
  targetService: z.string(),
  targetFunction: z.string().optional(),
  description: z.string(),
  expectedFailureMode: z.string(),
  severity: severitySchema,
  passCriteria: z.string(),
  failCriteria: z.string(),
  estimatedDurationSeconds: z.number().int().positive(),
  claudeConfidence: z.number().min(0).max(1),
  geminiConfidence: z.number().min(0).max(1),
  consensusScore: z.number().min(0).max(1),
});

export const hypothesisListSchema = z.array(hypothesisSchema);

export type ExperimentType = z.infer<typeof experimentTypeSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type Hypothesis = z.infer<typeof hypothesisSchema>;
