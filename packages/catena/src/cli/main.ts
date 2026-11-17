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

/** An error the user can fix in what they gave the command, as opposed to a fault of catena's own. */
function isUsersError(error: unknown): error is Error {
  return (
    error instanceof InvalidDiagramFileError ||
    error instanceof InvalidNodeContentError ||
    error instanceof InvalidGraphError ||
    error instanceof RangeError
  );
}

/** An error the system gave reading or writing a file, whose message names the file. */
function isFileError(error: unknown): error is Error {
  return error instanceof Error && "code" in error && "path" in error;
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
  try {
    const svg = drawDiagramFile(readDiagramFile(readFileSync(path, "utf8")), defaultTheme());
    const out = parsed.values.output;
    if (out === undefined) {
      stdout.write(`${svg}\n`);
    } else {
      writeFileSync(out, `${svg}\n`);
    }
    return 0;
  } catch (error) {
    if (isFileError(error)) {
      stderr.write(`catena: ${error.message}\n`);
      return 1;
    }
    if (!isUsersError(error)) throw error;
    stderr.write(`catena: ${path}: ${error.message}\n`);
    return 1;
  }
}
