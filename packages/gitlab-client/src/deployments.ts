import { z } from "zod";

import { GitLabClient } from "./index.js";

const deploymentStatusSchema = z.object({
  id: z.number().optional(),
  status: z.string().optional(),
});

export async function createDeploymentStatus(
  client: GitLabClient,
  projectId: number,
  deploymentId: number,
  status: "success" | "failed" | "running" | "canceled",
) {
  return client.request(`projects/${projectId}/deployments/${deploymentId}/statuses`, {
    method: "POST",
    body: { status },
    schema: deploymentStatusSchema,
  });
}
