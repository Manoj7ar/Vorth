import { execa } from "execa";

export async function runLatencyInjection(config: {
  namespace: string;
  targetContainer: string;
  latencyMs: number;
  jitterMs: number;
  durationSeconds: number;
}): Promise<string> {
  const command = [
    "kubectl",
    "exec",
    "-n",
    config.namespace,
    config.targetContainer,
    "--",
    "sh",
    "-lc",
    `'tc qdisc add dev eth0 root netem delay ${config.latencyMs}ms ${config.jitterMs}ms && sleep ${config.durationSeconds} && tc qdisc del dev eth0 root'`,
  ].join(" ");

  const result = await execa("sh", ["-lc", command], { reject: false });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Latency injection failed");
  }

  return result.stdout;
}
