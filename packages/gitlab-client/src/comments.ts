import { z } from "zod";

import { GitLabClient } from "./index.js";

const noteSchema = z.object({
  id: z.number(),
  body: z.string(),
  author: z
    .object({
      username: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

export async function postMergeRequestComment(
  client: GitLabClient,
  projectId: number,
  mrId: number,
  body: string,
) {
  return client.request(`projects/${projectId}/merge_requests/${mrId}/notes`, {
    method: "POST",
    body: { body },
    schema: noteSchema,
  });
}

export async function listMergeRequestComments(client: GitLabClient, projectId: number, mrId: number) {
  return client.request(`projects/${projectId}/merge_requests/${mrId}/notes`, {
    schema: z.array(noteSchema),
  });
}
