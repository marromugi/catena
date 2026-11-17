/** An XML element as {@link parseXml} reads it: its name, its attributes with entities decoded, and its child elements. */
export interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
}

/** The text is not XML this reader can read; `at` is the offset into the text where reading stopped. */
export class MalformedXmlError extends Error {
  override readonly name = "MalformedXmlError";

  constructor(
    readonly reason: string,
    readonly at: number,
  ) {
    super(`${reason} at offset ${at}.`);
  }
}

const PREDEFINED: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

const NAME = /[^\s/>=<"'!?]+/y;
const SPACE = /\s*/y;

/**
 * The root element of `text`. Reads elements, attributes, comments, CDATA sections, processing
 * instructions (the XML declaration among them) and a doctype, whose internal subset is skipped.
 * Text between elements is skipped. Entities are the five XML predefines and numeric character
 * references; any other is refused.
 * @throws MalformedXmlError when the text is not one well-formed root element.
 */
export function parseXml(text: string): XmlElement {
  const reader = new Reader(text.startsWith("﻿") ? text.slice(1) : text);
  reader.skipMisc(true);
  if (!reader.at("<")) reader.fail("Expected the root element");
  const root = reader.element();
  reader.skipMisc(false);
  if (!reader.done()) reader.fail("Expected nothing after the root element");
  return root;
}

class Reader {
  private offset = 0;

  constructor(private readonly text: string) {}

  done(): boolean {
    return this.offset >= this.text.length;
  }

  at(prefix: string): boolean {
    return this.text.startsWith(prefix, this.offset);
  }

  fail(reason: string): never {
    throw new MalformedXmlError(reason, this.offset);
  }

  /** Skips space, comments and processing instructions, and a doctype when `beforeRoot`. */
  skipMisc(beforeRoot: boolean): void {
    for (;;) {
      this.skipSpace();
      if (this.at("<!--")) this.skipPast("-->", "comment");
      else if (this.at("<?")) this.skipPast("?>", "processing instruction");
      else if (beforeRoot && this.at("<!DOCTYPE")) this.skipDoctype();
      else return;
    }
  }

  /** Reads the element that starts here, through its end tag. */
  element(): XmlElement {
    this.expect("<");
    const name = this.name();
    const attributes = new Map<string, string>();
    for (;;) {
      const spaced = this.skipSpace();
      if (this.at("/>")) {
        this.offset += 2;
        return { name, attributes, children: [] };
      }
      if (this.at(">")) {
        this.offset += 1;
        return { name, attributes, children: this.content(name) };
      }
      if (!spaced) this.fail(`Expected space before an attribute of <${name}>`);
      const attribute = this.name();
      if (attributes.has(attribute)) this.fail(`<${name}> gives ${attribute} twice`);
      this.skipSpace();
      this.expect("=");
      this.skipSpace();
      attributes.set(attribute, this.attributeValue());
    }
  }

  private content(name: string): XmlElement[] {
    const children: XmlElement[] = [];
    for (;;) {
      const next = this.text.indexOf("<", this.offset);
      if (next === -1) {
        this.offset = this.text.length;
        this.fail(`<${name}> is not closed`);
      }
      this.offset = next;
      if (this.at("</")) {
        const endTag = this.offset;
        this.offset += 2;
        if (this.name() !== name) throw new MalformedXmlError(`Expected </${name}>`, endTag);
        this.skipSpace();
        this.expect(">");
        return children;
      }
      if (this.at("<!--")) this.skipPast("-->", "comment");
      else if (this.at("<![CDATA[")) this.skipPast("]]>", "CDATA section");
      else if (this.at("<?")) this.skipPast("?>", "processing instruction");
      else children.push(this.element());
    }
  }

  private attributeValue(): string {
    const quote = this.text[this.offset];
    if (quote !== '"' && quote !== "'") this.fail("Expected a quoted attribute value");
    const end = this.text.indexOf(quote, this.offset + 1);
    if (end === -1) this.fail("The attribute value is not closed");
    const raw = this.text.slice(this.offset + 1, end);
    if (raw.includes("<")) this.fail("An attribute value holds <");
    const start = this.offset + 1;
    this.offset = end + 1;
    return raw
      .replaceAll(/[\t\n\r]/g, " ")
      .replaceAll(/&([^;]*);?/g, (whole, entity: string, index: number) =>
        decodeEntity(whole, entity, start + index),
      );
  }

  private skipDoctype(): void {
    for (this.offset += "<!DOCTYPE".length; !this.done(); this.offset += 1) {
      const c = this.text[this.offset];
      if (c === ">") {
        this.offset += 1;
        return;
      }
      if (c === "[") {
        const end = this.text.indexOf("]", this.offset);
        if (end === -1) break;
        this.offset = end;
      }
    }
    this.fail("The doctype is not closed");
  }

  private skipPast(end: string, what: string): void {
    const found = this.text.indexOf(end, this.offset);
    if (found === -1) this.fail(`The ${what} is not closed`);
    this.offset = found + end.length;
  }

  private skipSpace(): boolean {
    SPACE.lastIndex = this.offset;
    SPACE.exec(this.text);
    const moved = SPACE.lastIndex > this.offset;
    this.offset = SPACE.lastIndex;
    return moved;
  }

  private name(): string {
    NAME.lastIndex = this.offset;
    const found = NAME.exec(this.text);
    if (found === null) this.fail("Expected a name");
    this.offset = NAME.lastIndex;
    return found[0];
  }

  private expect(literal: string): void {
    if (!this.at(literal)) this.fail(`Expected ${literal}`);
    this.offset += literal.length;
  }
}

function decodeEntity(whole: string, entity: string, at: number): string {
  if (!whole.endsWith(";")) throw new MalformedXmlError("An & starts no entity", at);
  const predefined = PREDEFINED[entity];
  if (predefined !== undefined) return predefined;
  const code = /^#x[0-9a-fA-F]+$/.test(entity)
    ? Number.parseInt(entity.slice(2), 16)
    : /^#[0-9]+$/.test(entity)
      ? Number.parseInt(entity.slice(1), 10)
      : undefined;
  if (code === undefined)
    throw new MalformedXmlError(`&${entity}; is not an entity XML predefines`, at);
  if (code > 0x10ffff) throw new MalformedXmlError(`&${entity}; is past the last character`, at);
  return String.fromCodePoint(code);
}
