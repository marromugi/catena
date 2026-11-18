import { describe, expect, test } from "vitest";
import { element, writeSvg } from "./index";

describe("writeSvg", () => {
  test("writes an element's attributes and then its children inside it", () => {
    expect(writeSvg(element("g", { id: "a" }, [element("rect", { x: 1 })]))).toBe(
      `<g id="a"><rect x="1"/></g>`,
    );
  });
});
