import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { iconNames } from "../icon";
import { UnreadableSvgError } from "../node";
import { configFile, InvalidConfigError, readCustomIcons } from "./index";

// Made-up shapes: catena's tests carry no real company's mark or colours.
const SQUARE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z" fill="teal"/></svg>';
const SQUARE_LOGO = {
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  shapes: [{ pathData: "M0 0H10V10H0Z", paint: "fill", color: "teal" }],
};
const OWN_ICON = {
  pathData: "M2 2L8 8",
  viewBox: { x: 0, y: 0, width: 10, height: 10 },
  paint: "stroke",
};
const OWN_IMAGE = { href: "data:image/png;base64,AAAA" };

let dir: string;
let file: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "catena-config-")));
  file = join(dir, "config.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const write = (config: unknown) =>
  writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config));

/** The error reading the config throws. */
const refusal = (): InvalidConfigError => {
  try {
    readCustomIcons(file);
  } catch (error) {
    if (error instanceof InvalidConfigError) return error;
    throw error;
  }
  throw new Error("The config was read.");
};

describe("configFile", () => {
  test("is config.json in CATENA_CONFIG_DIR before anything else", () => {
    expect(configFile({ CATENA_CONFIG_DIR: "/own", XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe(
      "/own/config.json",
    );
  });

  test("is under XDG_CONFIG_HOME when only that is set", () => {
    expect(configFile({ XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe("/xdg/catena/config.json");
  });

  test("is under ~/.config with neither set, or set empty, or XDG_CONFIG_HOME relative", () => {
    const fallback = "/home/u/.config/catena/config.json";
    expect(configFile({}, "/home/u")).toBe(fallback);
    expect(configFile({ CATENA_CONFIG_DIR: "", XDG_CONFIG_HOME: "" }, "/home/u")).toBe(fallback);
    expect(configFile({ XDG_CONFIG_HOME: "xdg" }, "/home/u")).toBe(fallback);
  });

  test("reads the process's environment when given none", () => {
    vi.stubEnv("CATENA_CONFIG_DIR", dir);
    expect(configFile()).toBe(file);
    write({ icons: { square: OWN_IMAGE } });
    expect(readCustomIcons()).toEqual({ square: OWN_IMAGE });
  });
});

describe("readCustomIcons", () => {
  test("gives no icons when the file or its directory is not there", () => {
    expect(readCustomIcons(file)).toEqual({});
    expect(readCustomIcons(join(dir, "none", "config.json"))).toEqual({});
  });

  test("gives no icons for a config without icons", () => {
    write({});
    expect(readCustomIcons(file)).toEqual({});
    write({ icons: {} });
    expect(readCustomIcons(file)).toEqual({});
  });

  test("reads inline icons, logos and images by name", () => {
    write({ icons: { mine: OWN_ICON, square: SQUARE_LOGO, photo: OWN_IMAGE } });
    expect(readCustomIcons(file)).toEqual({
      mine: OWN_ICON,
      square: SQUARE_LOGO,
      photo: OWN_IMAGE,
    });
  });

  test("reads an SVG file relative to the config's directory, or at an absolute path", () => {
    mkdirSync(join(dir, "logos"));
    writeFileSync(join(dir, "logos", "square.svg"), SQUARE_SVG);
    write({ icons: { near: "logos/square.svg", far: join(dir, "logos", "square.svg") } });
    expect(readCustomIcons(file)).toEqual({ near: SQUARE_LOGO, far: SQUARE_LOGO });
  });

  test("keeps a name that is an Object property as its own entry", () => {
    write('{ "icons": { "__proto__": { "href": "a.png" }, "constructor": { "href": "b.png" } } }');
    const icons = readCustomIcons(file);
    expect(Object.keys(icons)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(icons)).toBe(Object.prototype);
  });

  test("skips a byte order mark before the JSON", () => {
    write(`\uFEFF${JSON.stringify({ icons: { photo: OWN_IMAGE } })}`);
    expect(readCustomIcons(file)).toEqual({ photo: OWN_IMAGE });
  });

  test("reads an SVG file relative to where a linked config file really is", () => {
    mkdirSync(join(dir, "real"));
    mkdirSync(join(dir, "link"));
    writeFileSync(join(dir, "real", "square.svg"), SQUARE_SVG);
    writeFileSync(
      join(dir, "real", "config.json"),
      JSON.stringify({ icons: { near: "square.svg" } }),
    );
    symlinkSync(join(dir, "real", "config.json"), join(dir, "link", "config.json"));
    expect(readCustomIcons(join(dir, "link", "config.json"))).toEqual({ near: SQUARE_LOGO });
  });

  test("throws what Node throws for a config it cannot read, other than a missing one", () => {
    mkdirSync(file);
    expect(() => readCustomIcons(file)).toThrow(expect.objectContaining({ code: "EISDIR" }));
    writeFileSync(join(dir, "plain"), "");
    expect(() => readCustomIcons(join(dir, "plain", "config.json"))).toThrow(
      expect.objectContaining({ code: "ENOTDIR" }),
    );
  });

  test("gives icons or InvalidConfigError for any text in the file", () => {
    const text = fc.oneof(
      fc.string(),
      fc.json(),
      fc.jsonValue().map((icons) => JSON.stringify({ icons })),
    );
    fc.assert(
      fc.property(text, (given) => {
        write(given);
        let outcome: unknown;
        try {
          outcome = readCustomIcons(file);
        } catch (error) {
          outcome = error;
        }
        expect(outcome instanceof InvalidConfigError || !(outcome instanceof Error)).toBe(true);
      }),
    );
  });

  test("reads any icons under names that are not built in, and refuses each built-in name", () => {
    const ICON = fc.constantFrom<unknown>(OWN_ICON, SQUARE_LOGO, OWN_IMAGE);
    const notBuiltIn = fc
      .string()
      .filter((name) => !(iconNames as readonly string[]).includes(name));
    fc.assert(
      fc.property(fc.dictionary(notBuiltIn, ICON), (icons) => {
        write({ icons });
        expect(readCustomIcons(file)).toEqual(icons);
      }),
    );
    fc.assert(
      fc.property(fc.dictionary(notBuiltIn, ICON), fc.constantFrom(...iconNames), (icons, name) => {
        write({ icons: { ...icons, [name]: OWN_IMAGE } });
        expect(refusal()).toMatchObject({ file, icon: name });
      }),
    );
  });

  test("refuses a built-in icon's name, naming it", () => {
    write({ icons: { mine: OWN_IMAGE, user: OWN_IMAGE } });
    expect(refusal()).toMatchObject({
      name: "InvalidConfigError",
      file,
      icon: "user",
      message: `The catena config ${file}: icon "user" is a built-in icon's name.`,
    });
  });

  test.each([
    ["a number", 3],
    ["null", null],
    ["an array", [OWN_IMAGE]],
    ["a registered logo", { logo: "square" }],
    ["a built-in icon by name in an object", { name: "user" }],
    ["an icon with a key too many", { ...OWN_IMAGE, alt: "photo" }],
    ["an icon missing its paint", { pathData: "M0 0", viewBox: OWN_ICON.viewBox }],
    ["a logo without shapes", { ...SQUARE_LOGO, shapes: [] }],
  ])("refuses %s as an icon, naming the entry", (_, given) => {
    write({ icons: { mine: OWN_IMAGE, odd: given } });
    expect(refusal()).toMatchObject({
      file,
      icon: "odd",
      message: `The catena config ${file}: icon "odd" is none of: a path to an SVG file, an OwnIcon, an OwnLogo, an OwnImage.`,
    });
  });

  test("refuses an SVG file readSvgLogo refuses, naming the entry and keeping the cause", () => {
    writeFileSync(join(dir, "text.svg"), '<svg viewBox="0 0 1 1"><text>A</text></svg>');
    write({ icons: { lettered: "text.svg" } });
    const error = refusal();
    expect(error.cause).toBeInstanceOf(UnreadableSvgError);
    const reason = error.cause instanceof Error ? error.cause.message : "";
    expect(error).toMatchObject({
      file,
      icon: "lettered",
      message: `The catena config ${file}: icon "lettered" names ${join(dir, "text.svg")}: ${reason}`,
    });
  });

  test("refuses an SVG file that is not there, naming the entry and keeping the cause", () => {
    write({ icons: { gone: "gone.svg" } });
    const error = refusal();
    expect(error.cause).toMatchObject({ code: "ENOENT" });
    expect(error).toMatchObject({
      file,
      icon: "gone",
      message: `The catena config ${file}: icon "gone" names ${join(dir, "gone.svg")}, which cannot be read.`,
    });
  });

  test.each([
    ["not JSON", "{ icons: }", "is not JSON."],
    ["empty", "", "is not JSON."],
    ["an array", "[]", "is not an object."],
    ["a string", '"icons"', "is not an object."],
    ["null", "null", "is not an object."],
    ["holding another key", { icons: {}, icon: {} }, 'holds "icon", not a setting.'],
    [
      "holding icons that are an array",
      { icons: [OWN_IMAGE] },
      'holds "icons" that is not an object.',
    ],
    [
      "holding icons that are a string",
      { icons: "square.svg" },
      'holds "icons" that is not an object.',
    ],
  ])("refuses a file %s, naming the file", (_, config, reason) => {
    write(config);
    expect(refusal()).toMatchObject({
      file,
      icon: undefined,
      message: `The catena config ${file} ${reason}`,
    });
  });

  test("keeps JSON's own error as the cause of a file that is not JSON", () => {
    write("{");
    expect(refusal().cause).toBeInstanceOf(SyntaxError);
  });
});
