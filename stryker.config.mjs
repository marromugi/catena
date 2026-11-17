import path from "node:path";

const outside = `../.${path.basename(process.cwd())}-stryker-tmp`;

export default {
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  tempDirName: outside,
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: `${outside}/mutation.json` },
  // Names no file, so Stryker leaves the tsconfigs alone: it rewrites them through the
  // TypeScript JavaScript API, which TypeScript 7 doesn't have.
  tsconfigFile: "stryker-rewrites-no-tsconfig",
};
