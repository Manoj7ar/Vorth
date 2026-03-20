import { createGitLabClient, createBranch, createCommit, openDraftMergeRequest, readRepositoryFile } from "@vorth/gitlab-client";

interface PatchFile {
  filePath: string;
  newContent: string;
}

function normalizePath(path: string) {
  return path.replace(/^a\//, "").replace(/^b\//, "");
}

function applyUnifiedDiff(originalContent: string, patch: string) {
  const originalLines = originalContent.split("\n");
  const patchLines = patch.split("\n");
  const output: string[] = [];
  let originalIndex = 0;
  let pointer = 0;

  while (pointer < patchLines.length) {
    const line = patchLines[pointer];
    if (!line) {
      pointer += 1;
      continue;
    }

    if (!line.startsWith("@@")) {
      pointer += 1;
      continue;
    }

    const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (!match) {
      throw new Error(`Invalid hunk header: ${line}`);
    }

    const oldStartValue = match[1];
    if (!oldStartValue) {
      throw new Error(`Invalid hunk header: ${line}`);
    }
    const oldStart = Number.parseInt(oldStartValue, 10) - 1;

    while (originalIndex < oldStart) {
      output.push(originalLines[originalIndex] ?? "");
      originalIndex += 1;
    }

    pointer += 1;

    while (pointer < patchLines.length) {
      const patchLine = patchLines[pointer];
      if (!patchLine) {
        pointer += 1;
        continue;
      }
      if (patchLine.startsWith("@@")) {
        break;
      }

      if (patchLine.startsWith(" ")) {
        output.push(patchLine.slice(1));
        originalIndex += 1;
      } else if (patchLine.startsWith("-")) {
        originalIndex += 1;
      } else if (patchLine.startsWith("+")) {
        output.push(patchLine.slice(1));
      } else if (patchLine === "\\ No newline at end of file") {
        // Intentionally ignored.
      }
      pointer += 1;
    }
  }

  while (originalIndex < originalLines.length) {
    output.push(originalLines[originalIndex] ?? "");
    originalIndex += 1;
  }

  return output.join("\n");
}

function splitPatchByFile(patch: string) {
  const sections = patch
    .split(/^diff --git /m)
    .flatMap((section) => {
      const trimmed = section.trim();
      return trimmed ? [trimmed] : [];
    });

  if (sections.length === 0 && patch.includes("--- ")) {
    return [patch];
  }

  return sections;
}

async function parsePatch(projectId: number, branch: string, sourceBranch: string, patch: string): Promise<PatchFile[]> {
  const files: PatchFile[] = [];
  const sections = splitPatchByFile(patch);
  const client = createGitLabClient();

  for (const section of sections) {
    const lines = section.split("\n");
    const oldLine = lines.find((line) => line.startsWith("--- "));
    const newLine = lines.find((line) => line.startsWith("+++ "));

    if (!oldLine || !newLine) {
      continue;
    }

    const filePath = normalizePath(newLine.replace("+++ ", "").trim());
    const original = await readRepositoryFile(client, projectId, filePath, sourceBranch).catch(async () => {
      const created = await readRepositoryFile(
        client,
        projectId,
        normalizePath(oldLine.replace("--- ", "").trim()),
        branch,
      );
      return created;
    });

    files.push({
      filePath,
      newContent: applyUnifiedDiff(original.content, section),
    });
  }

  return files;
}

export async function createFixBranch(projectId: number, sourceBranch: string, mrId: number) {
  const branch = `vorth/fix-mr-${mrId}`;
  await createBranch(createGitLabClient(), projectId, branch, sourceBranch);
  return branch;
}

export async function applyPatch(projectId: number, branch: string, sourceBranch: string, patch: string) {
  const files = await parsePatch(projectId, branch, sourceBranch, patch);
  const actions = files.map((file) => ({
    action: "update" as const,
    file_path: file.filePath,
    content: file.newContent,
  }));

  if (actions.length === 0) {
    throw new Error("Claude returned a patch that did not contain any applicable file changes.");
  }

  return createCommit(
    createGitLabClient(),
    projectId,
    branch,
    "Vorth: apply resilience improvements",
    actions,
  );
}

export async function openDraftMR(projectId: number, branch: string, targetBranch: string, analysis: { mrId: number; summary: string }) {
  return openDraftMergeRequest(
    createGitLabClient(),
    projectId,
    branch,
    targetBranch,
    `Draft: Vorth fix: resilience improvements for MR #${analysis.mrId}`,
    analysis.summary,
  );
}
