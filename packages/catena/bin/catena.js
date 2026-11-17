#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

register({ tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) });
const { run } = await import("../src/cli/index.ts");
process.exitCode = run(process.argv.slice(2), process.stdout, process.stderr);
