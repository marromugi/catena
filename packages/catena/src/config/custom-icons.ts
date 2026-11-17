import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as v from "valibot";
import { iconNames } from "../icon";
import {
  icon as iconContent,
  readSvgLogo,
  UnreadableSvgError,
  type OwnIcon,
  type OwnImage,
  type OwnLogo,
} from "../node";

/**
 * An icon the user defines in their config file: their own icon, logo of shapes, or image, as the icon
 * part draws it given inline.
 */
export type CustomIcon = OwnIcon | OwnLogo | OwnImage;

/** The user's config file holds something {@link readCustomIcons} refuses; the message names the file and the entry. */
export class InvalidConfigError extends Error {
  override readonly name = "InvalidConfigError";

  constructor(
    readonly file: string,
    /** The icon entry refused, or `undefined` when the file as a whole is. */
    readonly icon: string | undefined,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(
      icon === undefined
        ? `The catena config ${file} ${reason}`
        : `The catena config ${file}: icon ${JSON.stringify(icon)} ${reason}`,
      options,
    );
  }
}

/**
 * Where the user's config file is, the same on every platform: `config.json` in `CATENA_CONFIG_DIR`
 * when that is set; else in `catena` under `XDG_CONFIG_HOME` when that is an absolute path; else in
 * `.config/catena` under `home`. An empty variable counts as unset.
 */
export function configFile(
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string {
  const own = env["CATENA_CONFIG_DIR"];
  if (own) return join(own, "config.json");
  const xdg = env["XDG_CONFIG_HOME"];
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, ".config");
  return join(base, "catena", "config.json");
}

const CONFIG_KEYS = new Set(["icons"]);

/**
 * The custom icons the user's config file defines, by name. The file is JSON,
 * `{ "icons": { "<name>": <icon> } }`, where an icon is either:
 * - a path to an SVG file, relative to the config file's directory, read as {@link readSvgLogo} reads it;
 * - an {@link OwnIcon}, {@link OwnLogo} or {@link OwnImage}, as an icon's content gives it inline.
 * A file that is not there means no custom icons.
 *
 * catena ships no logos: a logo or image in the config is the user's to use, following that brand's own
 * guidelines.
 * @throws InvalidConfigError naming the entry when a name is a built-in icon's, an icon is none of the
 * forms above, or its SVG file cannot be read or is refused by {@link readSvgLogo}; and naming the file
 * when it is not JSON, or not an object holding at most `icons`, an object.
 */
export function readCustomIcons(file: string = configFile()): Readonly<Record<string, CustomIcon>> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return {};
    throw error;
  }
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new InvalidConfigError(file, undefined, "is not JSON.", { cause: error });
  }
  if (!isPlainObject(config)) throw new InvalidConfigError(file, undefined, "is not an object.");
  const unknownKey = Object.keys(config).find((key) => !CONFIG_KEYS.has(key));
  if (unknownKey !== undefined) {
    throw new InvalidConfigError(
      file,
      undefined,
      `holds ${JSON.stringify(unknownKey)}, not a setting.`,
    );
  }
  const icons = config["icons"];
  if (icons === undefined) return {};
  if (!isPlainObject(icons))
    throw new InvalidConfigError(file, undefined, `holds "icons" that is not an object.`);
  const builtIn = new Set<string>(iconNames);
  return Object.fromEntries(
    Object.entries(icons).map(([name, given]) => {
      if (builtIn.has(name)) throw new InvalidConfigError(file, name, "is a built-in icon's name.");
      return [name, customIcon(file, name, given)];
    }),
  );
}

function customIcon(file: string, name: string, given: unknown): CustomIcon {
  if (typeof given === "string") return svgFileIcon(file, name, given);
  const parsed = v.safeParse(iconContent.schema, given);
  if (parsed.success && typeof parsed.output === "object" && !("logo" in parsed.output)) {
    return parsed.output;
  }
  throw new InvalidConfigError(
    file,
    name,
    "is none of: a path to an SVG file, an OwnIcon, an OwnLogo, an OwnImage.",
  );
}

function svgFileIcon(file: string, name: string, path: string): OwnLogo {
  const svgFile = resolve(dirname(file), path);
  let svg: string;
  try {
    svg = readFileSync(svgFile, "utf8");
  } catch (error) {
    throw new InvalidConfigError(file, name, `names ${svgFile}, which cannot be read.`, {
      cause: error,
    });
  }
  try {
    return readSvgLogo(svg);
  } catch (error) {
    if (error instanceof UnreadableSvgError) {
      throw new InvalidConfigError(file, name, `names ${svgFile}: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
