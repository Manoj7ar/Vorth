import { z } from "zod";

export const recommendationSchema = z.enum([
  "deploy",
  "fix-required",
  "do-not-deploy",
]);

export const resilienceScoreSchema = z.object({
  overall: z.number().int().min(0).max(100),
  breakdown: z.object({
    networkResilience: z.number().int().min(0).max(100),
    dependencyResilience: z.number().int().min(0).max(100),
    loadResilience: z.number().int().min(0).max(100),
    recoverySpeed: z.number().int().min(0).max(100),
  }),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  criticalFailures: z.array(z.string()),
  deploymentAllowed: z.boolean(),
  recommendation: recommendationSchema,
});

export type Recommendation = z.infer<typeof recommendationSchema>;
export type ResilienceScore = z.infer<typeof resilienceScoreSchema>;
