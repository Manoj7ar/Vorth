#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import pino from "pino";

import { runGateCheck } from "./gate-check.js";

const logger = pino({ name: "vorth-deploy-gate" });

function parseFlag(flag: string) {
  const index = process.argv.findIndex((value) => value === flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function main() {
  const command = process.argv[2];
  if (command !== "check") {
    throw new Error('Usage: vorth-gate check --mr-id <iid> --project-id <id> [--environment production]');
  }

  const mrId = Number.parseInt(parseFlag("--mr-id") ?? "", 10);
  const projectId = Number.parseInt(parseFlag("--project-id") ?? "", 10);
  const environment = parseFlag("--environment") ?? "production";

  if (Number.isNaN(mrId) || Number.isNaN(projectId)) {
    throw new Error("Both --mr-id and --project-id are required.");
  }

  const result = await runGateCheck(projectId, mrId, environment);
  process.stdout.write(`${result.reason}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    logger.error({ err: error }, "fatal deploy gate error");
    process.exitCode = 1;
  });
}
