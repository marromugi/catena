import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { configFile, InvalidConfigError, readCustomIcons } from "../config";
import { defineTheme, InvalidNodeContentError, type CustomIcons, type Theme } from "../node";
import { InvalidGraphError } from "../place";
import { Typeface } from "../text";
import { InvalidDiagramFileError, readDiagramFile } from "./diagram-file";
import { diagramJsonSchema } from "./diagram-schema";
import { drawDiagramFile, InvalidEdgeIconError } from "./draw";

export const USAGE = [
  "Usage: catena draw <diagram.json> [-o <out.svg>]",
  "       catena schema",
  "",
  'catena schema writes the diagram file\'s JSON Schema beside the config and prints the "$schema" line that',
  "points a diagram file at it. Keep the path in full: editors don't expand ~ or $HOME in it.",
].join("\n");

export interface Output {
  write(text: string): unknown;
}

const read = (url: URL) => Typeface.read(readFileSync(url));

function defaultTheme(icons: CustomIcons): Theme {
  return defineTheme(
    { regular: [read(sourceHanSansJP.regular)], bold: [read(sourceHanSansJP.bold)] },
    { icons },
  );
}

function configIcons(): { value: CustomIcons } | { refusal: string } {
  const file = configFile();
  try {
    return onFile(file, () => readCustomIcons(file));
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) throw error;
    return { refusal: error.message };
  }
}

function isRefusal(error: unknown): error is Error {
  return (
    error instanceof InvalidDiagramFileError ||
    error instanceof InvalidNodeContentError ||
    error instanceof InvalidEdgeIconError ||
    error instanceof InvalidGraphError
  );
}

function isSystemError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function onFile<T>(path: string, action: () => T): { value: T } | { refusal: string } {
  try {
    return { value: action() };
  } catch (error) {
    if (!isSystemError(error)) throw error;
    return { refusal: `${path}: ${error.message}` };
  }
}

function schemaFile(): string {
  return resolve(dirname(configFile()), "diagram.schema.json");
}

function writeSchema(file: string, icons: CustomIcons): { value: void } | { refusal: string } {
  const schema = `${JSON.stringify(diagramJsonSchema(Object.keys(icons)), null, 2)}\n`;
  return onFile(file, () => {
    if (textIn(file) === schema) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, schema);
  });
}

function textIn(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isSystemError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Runs `catena` with `args`, the words after the command's name, and gives its exit code.
 *
 * `catena draw` writes the diagram's SVG and exits 0, or exits 1 when the user's config or the diagram
 * file can't be read or the diagram drawn. Once the config is read, it brings the diagram file's JSON
 * Schema beside the config up to date; when that can't be written it says so on stderr and draws all
 * the same.
 *
 * `catena schema` writes that JSON Schema and prints the `"$schema"` line a diagram file points at it
 * with, its absolute path; or exits 1 when the config can't be read or
 * the schema written.
 *
 * Words that are not a command exit 2.
 */
export function run(args: readonly string[], stdout: Output, stderr: Output): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: { output: { type: "string", short: "o" } },
    });
  } catch (error) {
    stderr.write(`catena: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    return 2;
  }
  const [command, path, ...extra] = parsed.positionals;
  const out = parsed.values.output;
  if (command === "draw" && path !== undefined && extra.length === 0) {
    return drawCommand(path, out, stdout, stderr);
  }
  if (command === "schema" && path === undefined && out === undefined) {
    return schemaCommand(stdout, stderr);
  }
  stderr.write(`${USAGE}\n`);
  return 2;
}

function schemaCommand(stdout: Output, stderr: Output): number {
  const icons = configIcons();
  if ("refusal" in icons) {
    stderr.write(`catena: ${icons.refusal}\n`);
    return 1;
  }
  const file = schemaFile();
  const written = writeSchema(file, icons.value);
  if ("refusal" in written) {
    stderr.write(`catena: ${written.refusal}\n`);
    return 1;
  }
  stdout.write(`"$schema": ${JSON.stringify(file)}\n`);
  return 0;
}

function drawCommand(
  path: string,
  out: string | undefined,
  stdout: Output,
  stderr: Output,
): number {
  const icons = configIcons();
  if ("refusal" in icons) {
    stderr.write(`catena: ${icons.refusal}\n`);
    return 1;
  }
  const schemaWritten = writeSchema(schemaFile(), icons.value);
  if ("refusal" in schemaWritten) {
    stderr.write(
      `catena: the diagram file's JSON Schema was not written: ${schemaWritten.refusal}\n`,
    );
  }
  const text = onFile(path, () => readFileSync(path, "utf8"));
  if ("refusal" in text) {
    stderr.write(`catena: ${text.refusal}\n`);
    return 1;
  }
  let svg;
  try {
    svg = drawDiagramFile(readDiagramFile(text.value), defaultTheme(icons.value));
  } catch (error) {
    if (!isRefusal(error)) throw error;
    stderr.write(`catena: ${path}: ${error.message}\n`);
    return 1;
  }
  if (out === undefined) {
    stdout.write(`${svg}\n`);
    return 0;
  }
  const written = onFile(out, () => writeFileSync(out, `${svg}\n`));
  if ("refusal" in written) {
    stderr.write(`catena: ${written.refusal}\n`);
    return 1;
  }
  return 0;
}
