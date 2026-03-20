import { z } from "zod";

import { GitLabClient } from "./index.js";

const mergeRequestSchema = z.object({
  iid: z.number(),
  id: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  web_url: z.string().url().optional(),
});

const diffEntrySchema = z.object({
  old_path: z.string(),
  new_path: z.string(),
  diff: z.string(),
  new_file: z.boolean().optional(),
  deleted_file: z.boolean().optional(),
});

const mergeRequestChangesSchema = z.object({
  changes: z.array(diffEntrySchema),
  title: z.string(),
  description: z.string().nullable().optional(),
});

const branchSchema = z.object({
  name: z.string(),
  default: z.boolean().optional(),
});

const fileSchema = z.object({
  file_name: z.string().optional(),
  file_path: z.string().optional(),
  blob_id: z.string().optional(),
  content: z.string().optional(),
  encoding: z.string().optional(),
});

export type GitLabDiffEntry = z.infer<typeof diffEntrySchema>;
export type GitLabMergeRequest = z.infer<typeof mergeRequestSchema>;

export async function getMergeRequest(client: GitLabClient, projectId: number, mrId: number) {
  return client.request(`projects/${projectId}/merge_requests/${mrId}`, {
    schema: mergeRequestSchema,
  });
}

export async function listProjectMergeRequests(client: GitLabClient, projectId: number) {
  return client.request(`projects/${projectId}/merge_requests?state=all&per_page=50`, {
    schema: z.array(mergeRequestSchema),
  });
}

export async function fetchMergeRequestChanges(client: GitLabClient, projectId: number, mrId: number) {
  return client.request(`projects/${projectId}/merge_requests/${mrId}/changes`, {
    schema: mergeRequestChangesSchema,
  });
}

export async function createBranch(
  client: GitLabClient,
  projectId: number,
  branch: string,
  ref: string,
) {
  return client.request(`projects/${projectId}/repository/branches`, {
    method: "POST",
    body: { branch, ref },
    schema: branchSchema,
  });
}

export async function readRepositoryFile(
  client: GitLabClient,
  projectId: number,
  filePath: string,
  ref: string,
) {
  const encodedPath = encodeURIComponent(filePath);
  const file = await client.request(`projects/${projectId}/repository/files/${encodedPath}?ref=${encodeURIComponent(ref)}`, {
    schema: fileSchema,
  });

  const content = Buffer.from(file.content ?? "", file.encoding === "base64" ? "base64" : "utf8").toString("utf8");
  return {
    filePath,
    blobId: file.blob_id ?? "",
    content,
  };
}

interface CommitAction {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
}

const commitSchema = z.object({
  id: z.string(),
  short_id: z.string().optional(),
  web_url: z.string().url().optional(),
});

export async function createCommit(
  client: GitLabClient,
  projectId: number,
  branch: string,
  commitMessage: string,
  actions: CommitAction[],
) {
  return client.request(`projects/${projectId}/repository/commits`, {
    method: "POST",
    body: {
      branch,
      commit_message: commitMessage,
      actions,
    },
    schema: commitSchema,
  });
}

export async function openDraftMergeRequest(
  client: GitLabClient,
  projectId: number,
  sourceBranch: string,
  targetBranch: string,
  title: string,
  description: string,
) {
  return client.request(`projects/${projectId}/merge_requests`, {
    method: "POST",
    body: {
      source_branch: sourceBranch,
      target_branch: targetBranch,
      title,
      description,
      remove_source_branch: true,
    },
    schema: mergeRequestSchema,
  });
}
