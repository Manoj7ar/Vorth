import { execa } from "execa";

import { getEphemeralNamespaceName } from "./namespace.js";

async function kubectl(args: string[]) {
  const result = await execa("kubectl", args, {
    reject: false,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `kubectl ${args.join(" ")} failed`);
  }

  return result.stdout;
}

export async function provisionEphemeralNamespace(mrId: number) {
  const namespace = getEphemeralNamespaceName(mrId);
  await kubectl(["create", "namespace", namespace, "--dry-run=client", "-o", "yaml"]);
  await execa("sh", [
    "-lc",
    `kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`,
  ]);
  return namespace;
}

export async function deployServicesToNamespace(namespace: string, services: string[]) {
  for (const service of services) {
    await execa("sh", [
      "-lc",
      [
        `kubectl get deployment ${service} -n default -o yaml`,
        `sed 's/namespace: default/namespace: ${namespace}/g'`,
        `kubectl apply -n ${namespace} -f -`,
      ].join(" | "),
    ]);
  }
}

export async function getTargetPod(namespace: string, service: string) {
  const output = await kubectl([
    "get",
    "pods",
    "-n",
    namespace,
    "-l",
    `app=${service}`,
    "-o",
    "jsonpath={.items[0].metadata.name}",
  ]);

  if (!output) {
    throw new Error(`No pod found for service ${service} in namespace ${namespace}`);
  }

  return output;
}

export async function teardownNamespace(namespace: string) {
  await execa("kubectl", ["delete", "namespace", namespace, "--ignore-not-found=true"], {
    reject: false,
  });
}
