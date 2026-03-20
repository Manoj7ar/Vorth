#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "../dist/agents/deploy-gate/src/index.js");
const sourceEntry = resolve(here, "../src/index.ts");
const tsxPackageJson = require.resolve("tsx/package.json");
const tsxCli = resolve(dirname(tsxPackageJson), "dist/cli.mjs");

const child = existsSync(distEntry)
  ? spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], { stdio: "inherit" })
  : spawnSync(
      process.execPath,
      [tsxCli, sourceEntry, ...process.argv.slice(2)],
      { stdio: "inherit" },
    );

process.exit(child.status ?? 1);
