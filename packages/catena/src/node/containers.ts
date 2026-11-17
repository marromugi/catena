import * as v from "valibot";
import type { Block, Part } from "./part";
import { subtitle } from "./parts";
import { outlinedRect } from "./svg";
import type { ButtonLook, CardLook, Theme } from "./theme";

/**
 * A card drawn around `child`, in the look `lookOf` picks from the theme, the theme's card by default.
 * `child` is laid out inside the card's padding. The card fills the width it is given, and grows past it
 * when `child` is wider than the width left inside the padding.
 */
export function frame<TSchema extends v.GenericSchema>(
  child: Part<TSchema>,
  lookOf: (theme: Theme) => CardLook = (theme) => theme.card,
): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const inner = child.layout(content, theme, maxWidth - 2 * look.padding);
      return cardAround(inner, look, look.radius, maxWidth);
    },
  };
}

/**
 * A card in the look `lookOf` picks from the theme, fitted around `child` inside its padding rather than
 * filling the width it is given. It draws at the top-left of its box.
 */
export function fitted<TSchema extends v.GenericSchema>(
  child: Part<TSchema>,
  lookOf: (theme: Theme) => CardLook,
): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const inner = child.layout(content, theme, maxWidth - 2 * look.padding);
      return atOwnSize(cardAround(inner, look, look.radius, 0));
    },
  };
}

/**
 * A card in the look `lookOf` picks from the theme, fitted around `child` inside its padding, its ends
 * half its height round, so it is a circle around a square child. It draws at the top-left of its box.
 */
export function pill<TSchema extends v.GenericSchema>(
  child: Part<TSchema>,
  lookOf: (theme: Theme) => ButtonLook,
): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const inner = child.layout(content, theme, maxWidth - 2 * look.padding);
      const radius = (inner.size.height + 2 * look.padding) / 2;
      return atOwnSize(cardAround(inner, look, radius, 0));
    },
  };
}

/** `block` drawn at its own size at the top-left of whatever box it is given. */
function atOwnSize(block: Block): Block {
  return {
    size: block.size,
    draw: (box, newId) => block.draw({ x: box.x, y: box.y, ...block.size }, newId),
  };
}

/** `child` drawn at its own size, centred across the box it is given. */
export function centered<TSchema extends v.GenericSchema>(child: Part<TSchema>): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const inner = child.layout(content, theme, maxWidth);
      const { width, height } = inner.size;
      return {
        size: inner.size,
        draw: (box, newId) =>
          inner.draw({ x: box.x + (box.width - width) / 2, y: box.y, width, height }, newId),
      };
    },
  };
}

/** `child` laid out at the width `widthOf` picks from the theme, whatever width it is given. */
export function atWidth<TSchema extends v.GenericSchema>(
  child: Part<TSchema>,
  widthOf: (theme: Theme) => number,
): Part<TSchema> {
  return {
    schema: child.schema,
    layout: (content, theme) => child.layout(content, theme, widthOf(theme)),
  };
}

/** A card in the theme's panel look around `child`, such as the list of a section. Around a child that takes no room, it takes none either. */
export function panel<TSchema extends v.GenericSchema>(child: Part<TSchema>): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const look = theme.panel;
      const inner = child.layout(content, theme, maxWidth - 2 * look.padding);
      return isEmpty(inner) ? EMPTY : cardAround(inner, look, look.radius, maxWidth);
    },
  };
}

/**
 * A card in `look` with `radius`-round corners around `inner`, which is drawn inside its padding. See
 * {@link frame} for its width.
 */
function cardAround(inner: Block, look: ButtonLook, radius: number, maxWidth: number): Block {
  const { padding } = look;
  return {
    size: {
      width: Math.max(maxWidth, inner.size.width + 2 * padding),
      height: inner.size.height + 2 * padding,
    },
    draw: (box, newId) => [
      outlinedRect(box, radius, look),
      ...inner.draw(
        {
          x: box.x + padding,
          y: box.y + padding,
          width: box.width - 2 * padding,
          height: box.height - 2 * padding,
        },
        newId,
      ),
    ],
  };
}

const EMPTY: Block = { size: { width: 0, height: 0 }, draw: () => [] };

/** A part shown only when its content is given. Absent, it takes no room, and `stack` and `row` leave no gap for it. */
export function optional<TSchema extends v.GenericSchema>(
  part: Part<TSchema>,
): Part<v.OptionalSchema<TSchema, undefined>> {
  return {
    schema: v.optional(part.schema),
    layout: (content, theme, maxWidth) =>
      content === undefined ? EMPTY : part.layout(content, theme, maxWidth),
  };
}

/** Whether a block takes no room, so a container sets no gap beside it. */
function isEmpty(block: Block): boolean {
  return block.size.width === 0 && block.size.height === 0;
}

type Schemas<TParts extends Record<string, Part>> = { [K in keyof TParts]: TParts[K]["schema"] };

// JavaScript lists these keys out of the order they were written in, or reads them from the prototype.
const UNORDERED_KEY = /^(?:0|[1-9]\d*|__proto__)$/;

/**
 * `parts` as entries in the order their keys were written in, and the schema of an object holding each
 * part's content under its key. The schema refuses keys that are not parts', so a misspelt key is an error.
 * @throws Error when a key looks like an integer or is `__proto__`, since its place in the order is lost.
 */
function keyedParts<TParts extends Record<string, Part>>(container: string, parts: TParts) {
  const entries = Object.entries(parts);
  const unordered = entries.find(([key]) => UNORDERED_KEY.test(key));
  if (unordered !== undefined) {
    throw new Error(
      `A ${container}'s part may not be keyed "${unordered[0]}". Use a key that is a name.`,
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries loses the keys `parts` has.
  const shape = Object.fromEntries(
    entries.map(([key, part]) => [key, part.schema]),
  ) as Schemas<TParts>;
  return { entries, schema: v.strictObject(shape) };
}

/**
 * Parts set one over the next, in the order of `parts`' keys, the gap `gap` picks from the theme apart,
 * the theme's gap by default. Its content is an object holding each part's content under the part's key.
 * @throws Error when a key looks like an integer or is `__proto__`, since its place in the order is lost.
 */
export function stack<const TParts extends Record<string, Part>>(
  parts: TParts,
  options: { readonly gap?: (theme: Theme) => number } = {},
): Part<v.StrictObjectSchema<Schemas<TParts>, undefined>> {
  const { entries, schema } = keyedParts("stack", parts);
  const { gap = (theme: Theme) => theme.gap } = options;
  return {
    schema,
    layout: (content, theme, maxWidth) =>
      stacked(
        entries.map(([key, part]) => part.layout(content[key], theme, maxWidth)),
        gap(theme),
      ),
  };
}

/**
 * As many items as the content gives, each laid out by `item`, set one over the next the theme's gap
 * apart. Its content is an array of `item`'s content. With no items it takes no room.
 */
export function list<TSchema extends v.GenericSchema>(
  item: Part<TSchema>,
): Part<v.ArraySchema<TSchema, undefined>> {
  return {
    schema: v.array(item.schema),
    layout: (content, theme, maxWidth) =>
      stacked(
        content.map((each) => item.layout(each, theme, maxWidth)),
        theme.gap,
      ),
  };
}

/**
 * A heading over `items`, a gap apart. Its content is `{ heading, items }`: the heading's text, and
 * `items`' content.
 */
export function section<TSchema extends v.GenericSchema>(items: Part<TSchema>) {
  return stack({ heading: subtitle, items });
}

/** `blocks` set one over the next, `gap` apart, each as wide as the box. No gap is set beside an empty block. */
function stacked(blocks: readonly Block[], gap: number): Block {
  let next = 0;
  const placed = blocks
    .filter((block) => !isEmpty(block))
    .map((block) => {
      const top = next;
      next += block.size.height + gap;
      return { block, top };
    });
  return {
    size: {
      width: placed.reduce((widest, { block }) => Math.max(widest, block.size.width), 0),
      height: Math.max(0, next - gap),
    },
    draw: (box, newId) =>
      placed.flatMap(({ block, top }) =>
        block.draw(
          { x: box.x, y: box.y + top, width: box.width, height: block.size.height },
          newId,
        ),
      ),
  };
}

/**
 * Parts set side by side, the theme's gap apart, in the order of `parts`' keys, each centred in the
 * row's height; set at its top when `align` is `"start"`, and drawn as high as the row when it is `"stretch"`. Its content is an object holding each part's content under the part's key.
 *
 * Every part but `grow` is laid out first, each at the width the parts before it leave, and together
 * within half the row's width when it has a `grow` part. The `grow` part then takes all the width that is
 * left, so the row fills its width and the parts after `grow` sit at its end. With no `grow`, the parts
 * sit together at the start. No part is given a negative width, and no part is drawn over another: a part
 * wider than the width it was given pushes the parts after it along, and the row grows past its width.
 * @throws Error when a key looks like an integer or is `__proto__`, since its place in the order is lost.
 */
export function row<const TParts extends Record<string, Part>>(
  parts: TParts,
  options: {
    readonly grow?: keyof TParts & string;
    readonly align?: "center" | "start" | "stretch";
  } = {},
): Part<v.StrictObjectSchema<Schemas<TParts>, undefined>> {
  const { entries, schema } = keyedParts("row", parts);
  const { grow, align = "center" } = options;
  return {
    schema,
    layout(content, theme, maxWidth) {
      const blocks = new Map<string, Block>();
      const othersWidth = grow === undefined ? maxWidth : maxWidth / 2;
      let taken = 0;
      for (const [key, part] of entries) {
        if (key === grow) continue;
        const block = part.layout(content[key], theme, Math.max(0, othersWidth - taken));
        blocks.set(key, block);
        if (!isEmpty(block)) taken += block.size.width + theme.gap;
      }
      for (const [key, part] of entries) {
        if (key !== grow) continue;
        blocks.set(key, part.layout(content[key], theme, Math.max(0, maxWidth - taken)));
      }
      const shown = entries
        .map(([key]) => ({ key, block: blocks.get(key) ?? EMPTY }))
        .filter(({ block }) => !isEmpty(block));
      const fixedWidth = shown
        .filter(({ key }) => key !== grow)
        .reduce((sum, { block }) => sum + block.size.width, 0);
      const gaps = Math.max(0, shown.length - 1) * theme.gap;
      const grown = shown.find(({ key }) => key === grow)?.block;
      const growWidth = (rowWidth: number) =>
        Math.max(grown?.size.width ?? 0, rowWidth - fixedWidth - gaps);
      return {
        size: {
          width: grown === undefined ? fixedWidth + gaps : fixedWidth + gaps + growWidth(maxWidth),
          height: Math.max(0, ...shown.map(({ block }) => block.size.height)),
        },
        draw: (box, newId) => {
          let x = box.x;
          return shown.flatMap(({ key, block }) => {
            const width = key === grow ? growWidth(box.width) : block.size.width;
            const height = align === "stretch" ? box.height : block.size.height;
            const y = align === "center" ? box.y + (box.height - height) / 2 : box.y;
            const drawn = block.draw({ x, y, width, height }, newId);
            x += width + theme.gap;
            return drawn;
          });
        },
      };
    },
  };
}
