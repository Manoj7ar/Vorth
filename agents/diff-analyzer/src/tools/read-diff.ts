import { createGitLabClient } from "@vorth/gitlab-client";
import { readMrDiff } from "@vorth/mcp-tools";

export async function readDiff(projectId: number, mrId: number) {
  const client = createGitLabClient();
  return readMrDiff(client, projectId, mrId);
}
