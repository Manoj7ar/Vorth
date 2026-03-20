import { execa } from "execa";

export async function runMemoryStress(config: {
  namespace: string;
  targetPod: string;
  durationSeconds: number;
}): Promise<string> {
  const result = await execa(
    "kubectl",
    [
      "exec",
      "-n",
      config.namespace,
      config.targetPod,
      "--",
      "sh",
      "-lc",
      `timeout ${config.durationSeconds} sh -c 'x=$(head -c 134217728 /dev/zero | tr "\\0" "a"); sleep ${config.durationSeconds}'`,
    ],
    { reject: false },
  );

  if (![0, 124].includes(result.exitCode ?? 1)) {
    throw new Error(result.stderr || result.stdout || "Memory stress experiment failed");
  }

  return result.stdout;
}
