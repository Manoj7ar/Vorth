import { z } from "zod";

export const changeTypeSchema = z.enum([
  "timeout-logic",
  "retry-logic",
  "network-calls",
  "database-queries",
  "auth",
  "payment",
  "queue",
  "cache",
  "other",
]);

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const changeSurfaceSchema = z.object({
  mrId: z.number().int().nonnegative(),
  projectId: z.number().int().nonnegative(),
  changedFiles: z.array(z.string()),
  changedServices: z.array(z.string()),
  changeTypes: z.array(changeTypeSchema),
  riskLevel: riskLevelSchema,
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  summary: z.string(),
});

export type ChangeType = z.infer<typeof changeTypeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ChangeSurface = z.infer<typeof changeSurfaceSchema>;
