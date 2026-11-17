/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  tempDirName: "../.catena-stryker-tmp",
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "../.catena-stryker-tmp/mutation.json" },
  // Names no file, so Stryker leaves the tsconfigs alone: it rewrites them through the
  // TypeScript JavaScript API, which TypeScript 7 doesn't have.
  tsconfigFile: "stryker-rewrites-no-tsconfig",
};
