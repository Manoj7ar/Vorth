import { z } from "zod";

import { GitLabClient } from "./index.js";

const statusSchema = z.object({
  id: z.number().optional(),
  status: z.string(),
});

export async function postCommitStatus(
  client: GitLabClient,
  projectId: number,
  sha: string,
  state: "pending" | "running" | "success" | "failed" | "canceled",
  name: string,
  description: string,
  targetUrl?: string,
) {
  const params = new URLSearchParams({
    state,
    name,
    description,
  });

  if (targetUrl) {
    params.set("target_url", targetUrl);
  }

  return client.request(`projects/${projectId}/statuses/${sha}?${params.toString()}`, {
    method: "POST",
    schema: statusSchema,
  });
}

export async function getLatestPipeline(client: GitLabClient, projectId: number) {
  return client.request(`projects/${projectId}/pipelines?per_page=1`, {
    schema: z.array(
      z.object({
        id: z.number(),
        sha: z.string(),
        status: z.string(),
      }),
    ),
  });
}
