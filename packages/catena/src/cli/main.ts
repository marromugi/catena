import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { sourceHanSansJP } from "@catena/font-source-han-sans";
import { defineTheme, InvalidNodeContentError, type Theme } from "../node";
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

/** The theme every diagram is drawn in: the default looks, set in Source Han Sans JP. */
function defaultTheme(): Theme {
  return defineTheme({
    regular: [read(sourceHanSansJP.regular)],
    bold: [read(sourceHanSansJP.bold)],
  });
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
 * was written, 1 when the diagram file can't be read or drawn, 2 when the words are not a command.
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
  const text = onFile(path, () => readFileSync(path, "utf8"));
  if ("refusal" in text) {
    stderr.write(text.refusal);
    return 1;
  }
  let svg;
  try {
    svg = drawDiagramFile(readDiagramFile(text.value), defaultTheme());
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
