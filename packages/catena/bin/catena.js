#!/usr/bin/env node
import { register } from "tsx/esm/api";

register();
const { run } = await import("../src/cli/index.ts");
process.exitCode = run(process.argv.slice(2), process.stdout, process.stderr);
