import { identifyChangedServices } from "@vorth/mcp-tools";

export function identifyServices(changedFiles: string[]) {
  return identifyChangedServices(changedFiles);
}
