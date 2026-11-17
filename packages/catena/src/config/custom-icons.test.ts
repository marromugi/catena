import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  dir = mkdtempSync(join(tmpdir(), "catena-config-"));
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

  test("refuses a built-in icon's name, naming it", () => {
    write({ icons: { mine: OWN_IMAGE, user: OWN_IMAGE } });
    expect(refusal()).toMatchObject({ file, icon: "user" });
    expect(refusal().message).toContain('icon "user"');
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
    expect(refusal()).toMatchObject({ file, icon: "odd" });
  });

  test("refuses an SVG file readSvgLogo refuses, naming the entry and keeping the cause", () => {
    writeFileSync(join(dir, "text.svg"), '<svg viewBox="0 0 1 1"><text>A</text></svg>');
    write({ icons: { lettered: "text.svg" } });
    const error = refusal();
    expect(error).toMatchObject({ file, icon: "lettered" });
    expect(error.cause).toBeInstanceOf(UnreadableSvgError);
  });

  test("refuses an SVG file that is not there, naming the entry", () => {
    write({ icons: { gone: "gone.svg" } });
    expect(refusal()).toMatchObject({ file, icon: "gone" });
    expect(refusal().message).toContain(join(dir, "gone.svg"));
  });

  test.each([
    ["not JSON", "{ icons: }"],
    ["empty", ""],
    ["an array", "[]"],
    ["a string", '"icons"'],
    ["null", "null"],
    ["holding another key", { icons: {}, icon: {} }],
    ["holding icons that are an array", { icons: [OWN_IMAGE] }],
    ["holding icons that are a string", { icons: "square.svg" }],
  ])("refuses a file %s, naming the file", (_, config) => {
    write(config);
    expect(refusal()).toMatchObject({ file, icon: undefined });
    expect(refusal().message).toContain(file);
  });
});
