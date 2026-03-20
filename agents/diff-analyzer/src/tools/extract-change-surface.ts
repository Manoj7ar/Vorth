import { extractChangeSurface } from "@vorth/mcp-tools";

export function buildChangeSurface(input: {
  mrId: number;
  projectId: number;
  changes: Array<{ new_path: string; diff: string }>;
}) {
  return extractChangeSurface(input);
}
