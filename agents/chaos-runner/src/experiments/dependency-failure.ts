import { execa } from "execa";

async function kubectl(args: string[]) {
  const result = await execa("kubectl", args, { reject: false });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `kubectl ${args.join(" ")} failed`);
  }

  return result.stdout;
}

export async function runDependencyFailure(config: {
  namespace: string;
  dependencyService: string;
  durationSeconds: number;
}): Promise<string> {
  const replicas = await kubectl([
    "get",
    "deployment",
    config.dependencyService,
    "-n",
    config.namespace,
    "-o",
    "jsonpath={.spec.replicas}",
  ]);

  await kubectl([
    "scale",
    "deployment",
    config.dependencyService,
    "-n",
    config.namespace,
    "--replicas=0",
  ]);

  await new Promise((resolve) => setTimeout(resolve, config.durationSeconds * 1000));

  await kubectl([
    "scale",
    "deployment",
    config.dependencyService,
    "-n",
    config.namespace,
    `--replicas=${replicas || "1"}`,
  ]);

  return `Scaled ${config.dependencyService} to 0 for ${config.durationSeconds}s and restored to ${replicas || "1"} replicas.`;
}
