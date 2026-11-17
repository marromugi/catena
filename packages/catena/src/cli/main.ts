import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { configFile, InvalidConfigError, readCustomIcons } from "../config";
import { defineTheme, InvalidNodeContentError, type CustomIcons, type Theme } from "../node";
import { InvalidGraphError } from "../place";
import { Typeface } from "../text";
import { InvalidDiagramFileError, readDiagramFile } from "./diagram-file";
import { drawDiagramFile } from "./draw";

export const USAGE = "Usage: catena draw <diagram.json> [-o <out.svg>]";

/** Where the command writes what it says. */
export interface Output {
  write(text: string): unknown;
}

const read = (url: URL) => Typeface.read(readFileSync(url));

/**
 * The theme every diagram is drawn in: the default looks, set in Source Han Sans JP, holding the custom
 * icons of the user's config.
 */
function defaultTheme(icons: CustomIcons): Theme {
  return defineTheme(
    { regular: [read(sourceHanSansJP.regular)], bold: [read(sourceHanSansJP.bold)] },
    { icons },
  );
}

/**
 * The custom icons the user's config file defines, or the line saying why they can't be read.
 * @throws what reading them throws that is neither the config's refusal nor the system's.
 */
function configIcons(): { value: CustomIcons } | { refusal: string } {
  const file = configFile();
  try {
    return onFile(file, () => readCustomIcons(file));
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) throw error;
    return { refusal: `catena: ${error.message}\n` };
  }
}

/** A refusal of the diagram file's, as opposed to a fault of catena's own. */
function isRefusal(error: unknown): error is Error {
  return (
    error instanceof InvalidDiagramFileError ||
    error instanceof InvalidNodeContentError ||
    error instanceof InvalidGraphError
  );
}

/** An error the system gave for a file, such as one missing, a directory, or not allowed. */
function isSystemError(error: unknown): error is Error {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

/**
 * What `action` gives, or the line saying why the system refused it on `path`.
 * @throws what `action` throws that the system did not give.
 */
function onFile<T>(path: string, action: () => T): { value: T } | { refusal: string } {
  try {
    return { value: action() };
  } catch (error) {
    if (!isSystemError(error)) throw error;
    return { refusal: `catena: ${path}: ${error.message}\n` };
  }
}

/**
 * Runs `catena` with `args`, the words after the command's name, and gives its exit code: 0 when the SVG
 * was written, 1 when the user's config or the diagram file can't be read or the diagram drawn, 2 when the
 * words are not a command. A bare string as an icon's content names a built-in icon or one of the config's.
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
  if (command !== "draw" || path === undefined || extra.length > 0) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }
  const icons = configIcons();
  if ("refusal" in icons) {
    stderr.write(icons.refusal);
    return 1;
  }
  const text = onFile(path, () => readFileSync(path, "utf8"));
  if ("refusal" in text) {
    stderr.write(text.refusal);
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
  const out = parsed.values.output;
  if (out === undefined) {
    stdout.write(`${svg}\n`);
    return 0;
  }
  const written = onFile(out, () => writeFileSync(out, `${svg}\n`));
  if ("refusal" in written) {
    stderr.write(written.refusal);
    return 1;
  }
  return 0;
}
