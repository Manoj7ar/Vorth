import { execa } from "execa";

export async function runCpuStress(config: {
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
      `timeout ${config.durationSeconds} sh -c 'while true; do :; done'`,
    ],
    { reject: false },
  );

  if (![0, 124].includes(result.exitCode ?? 1)) {
    throw new Error(result.stderr || result.stdout || "CPU stress experiment failed");
  }

  return result.stdout;
}
