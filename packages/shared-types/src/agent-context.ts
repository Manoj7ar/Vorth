import { z } from "zod";

import { changeSurfaceSchema } from "./change-surface.js";
import { experimentResultSchema } from "./experiment.js";
import { hypothesisSchema } from "./hypothesis.js";
import { resilienceScoreSchema } from "./resilience-score.js";

export const agentContextSchema = z.object({
  requestId: z.string(),
  projectId: z.number().int().nonnegative(),
  mrId: z.number().int().nonnegative().optional(),
  sourceBranch: z.string().optional(),
  targetBranch: z.string().optional(),
  environment: z.string().optional(),
  changeSurface: changeSurfaceSchema.optional(),
  hypotheses: z.array(hypothesisSchema).optional(),
  experimentResults: z.array(experimentResultSchema).optional(),
  resilienceScore: resilienceScoreSchema.optional(),
});

export type AgentContext = z.infer<typeof agentContextSchema>;
