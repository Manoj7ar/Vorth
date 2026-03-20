import { execa } from "execa";

export async function runNetworkPartition(config: {
  namespace: string;
  targetPod: string;
  targetPort: number;
  durationSeconds: number;
}): Promise<string> {
  const command = [
    "kubectl",
    "exec",
    "-n",
    config.namespace,
    config.targetPod,
    "--",
    "sh",
    "-lc",
    `'tc qdisc add dev eth0 root handle 1: prio && tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 match ip dport ${config.targetPort} 0xffff flowid 1:1 && tc qdisc add dev eth0 parent 1:1 handle 10: netem loss 100% && sleep ${config.durationSeconds} && tc qdisc del dev eth0 root'`,
  ].join(" ");

  const result = await execa("sh", ["-lc", command], { reject: false });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Network partition experiment failed");
  }

  return result.stdout;
}
