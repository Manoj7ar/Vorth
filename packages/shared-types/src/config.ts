import { z } from "zod";

export const vorthConfigSchema = z.object({
  gitlabBaseUrl: z.string().url(),
  gitlabMcpServerUrl: z.string().url(),
  minResilienceScore: z.number().int().min(0).max(100),
  maxExperimentsPerMr: z.number().int().positive(),
  chaosExperimentTimeoutSeconds: z.number().int().positive(),
  googleCloudProjectId: z.string().min(1),
  googleCloudRegion: z.string().min(1),
  vertexAiLocation: z.string().min(1),
  gkeClusterName: z.string().min(1),
  gkeClusterZone: z.string().min(1),
});

export type VorthConfig = z.infer<typeof vorthConfigSchema>;
