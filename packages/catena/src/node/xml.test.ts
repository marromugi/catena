import { describe, expect, test } from "vitest";
import { MalformedXmlError, parseXml } from "./xml";

const nested = (depth: number) => "<a>".repeat(depth) + "<a/>" + "</a>".repeat(depth);

describe("parseXml", () => {
  test("reads elements and their attributes, skipping what is not an element", () => {
    const root = parseXml(
      '﻿<?xml version="1.0"?>\n<!-- before -->\n' +
        '<!DOCTYPE svg PUBLIC "a>b" \'c]\' [ <!ENTITY a "]>"> ]>\n' +
        '<a x=\'1\' y = "2">text<![CDATA[ <b/> ]]><?pi x?><!-- <c/> --><b/><c z="&lt;&gt;&amp;&quot;&apos;&#65;&#x42;"></c ></a>\n' +
        "<!-- after --><?pi?>",
    );

    expect(root).toEqual({
      name: "a",
      attributes: new Map([
        ["x", "1"],
        ["y", "2"],
      ]),
      children: [
        { name: "b", attributes: new Map(), children: [] },
        { name: "c", attributes: new Map([["z", "<>&\"'AB"]]), children: [] },
      ],
    });
  });

  test("an attribute value's line ends and tabs each become one space", () => {
    expect(parseXml('<a v="1\r\n2\r3\n4\t5"/>').attributes.get("v")).toBe("1 2 3 4 5");
  });

  test("a doctype with no internal subset is skipped", () => {
    expect(parseXml("<!DOCTYPE a><a/>").name).toBe("a");
  });

  const malformed: ReadonlyArray<readonly [string, string, number]> = [
    ["", "Expected the root element", 0],
    ["text", "Expected the root element", 0],
    ["<a/><b/>", "Expected nothing after the root element", 4],
    ["<a/><!DOCTYPE a>", "Expected nothing after the root element", 4],
    ["<!-- x", "The comment is not closed", 0],
    ["<!-- -- ->", "The comment is not closed", 0],
    ["<?pi", "The processing instruction is not closed", 0],
    ["<!DOCTYPE a [ ]", "The doctype is not closed", 15],
    ['<!DOCTYPE a "x>', "The doctype is not closed", 12],
    ["<a><![CDATA[ x", "The CDATA section is not closed", 3],
    ["<a>", "<a> is not closed", 3],
    ["<a></b>", "Expected </a>", 3],
    ["<a></a", "Expected >", 6],
    ["<a x='1'y='2'/>", "Expected space before an attribute of <a>", 8],
    ["<a x='1' x='2'/>", "<a> gives x twice", 10],
    ["<a x/>", "Expected =", 4],
    ["<a x=1/>", "Expected a quoted attribute value", 5],
    ["<a x='1/>", "The attribute value is not closed", 5],
    ["<a x='<'/>", "An attribute value holds <", 5],
    ["< a/>", "Expected a name", 1],
    ["<a x='1 & 2'/>", "An & starts no entity", 8],
    ["<a x='ab&x'/>", "An & starts no entity", 8],
    ["<a x='ab&nbsp;'/>", "&nbsp; is not an entity XML predefines", 8],
    ["<a x='&toString;'/>", "&toString; is not an entity XML predefines", 6],
    ["<a x='&a#x41;'/>", "&a#x41; is not an entity XML predefines", 6],
    ["<a x='&#x41a;&#0;'/>", "&#0; is not a character XML allows", 13],
    ["<a x='&#xD800;'/>", "&#xD800; is not a character XML allows", 6],
    ["<a x='&#x110000;'/>", "&#x110000; is not a character XML allows", 6],
  ];

  test.each(malformed)("refuses %j: %s at %i", (text, reason, at) => {
    expect(() => parseXml(text)).toThrow(new MalformedXmlError(reason, at));
  });

  test("the error carries its reason and offset, and its name", () => {
    const error = new MalformedXmlError("Expected a name", 3);
    expect({
      name: error.name,
      message: error.message,
      reason: error.reason,
      at: error.at,
    }).toEqual({
      name: "MalformedXmlError",
      message: "Expected a name at offset 3.",
      reason: "Expected a name",
      at: 3,
    });
  });

  test("elements may nest 256 deep, not deeper", () => {
    expect(() => parseXml(nested(256))).not.toThrow();
    expect(() => parseXml(nested(257))).toThrow(
      new MalformedXmlError("Elements nest deeper than 256", 257 * 3),
    );
  });
});
