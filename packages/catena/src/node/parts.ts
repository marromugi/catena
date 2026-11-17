import * as v from "valibot";
import { layoutText, textPathData } from "../text";
import type { Part } from "./part";
import { element } from "./svg";
import type { TextLook, Theme } from "./theme";

const TEXT = v.string();

/** A part showing a string, wrapped to the width it is given, in the look `lookOf` picks from the theme. */
export function textPart(lookOf: (theme: Theme) => TextLook): Part<typeof TEXT> {
  return {
    schema: TEXT,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const text = layoutText(content, {
        fonts: theme.fonts[look.weight],
        size: look.size,
        lineHeight: look.lineHeight,
        maxWidth,
      });
      return {
        size: { width: text.width, height: text.height },
        draw: (box) => [element("path", { d: textPathData(text, box.x, box.y), fill: look.color })],
      };
    },
  };
}

export const title = textPart((theme) => theme.title);

export const bodyText = textPart((theme) => theme.body);

/** A card drawn around `child`, which is laid out inside the card's padding. The card fills the width it is given. */
export function frame<TSchema extends v.GenericSchema>(child: Part<TSchema>): Part<TSchema> {
  return {
    schema: child.schema,
    layout(content, theme, maxWidth) {
      const { padding, radius, fill, stroke, strokeWidth } = theme.card;
      const inner = child.layout(content, theme, maxWidth - 2 * padding);
      return {
        size: { width: maxWidth, height: inner.size.height + 2 * padding },
        draw: (box) => [
          element("rect", {
            x: box.x + strokeWidth / 2,
            y: box.y + strokeWidth / 2,
            width: box.width - strokeWidth,
            height: box.height - strokeWidth,
            rx: radius,
            fill,
            stroke,
            "stroke-width": strokeWidth,
          }),
          ...inner.draw({
            x: box.x + padding,
            y: box.y + padding,
            width: box.width - 2 * padding,
            height: box.height - 2 * padding,
          }),
        ],
      };
    },
  };
}

type Schemas<TParts extends Record<string, Part>> = { [K in keyof TParts]: TParts[K]["schema"] };

// JavaScript lists these keys out of the order they were written in, or reads them from the prototype.
const UNORDERED_KEY = /^(?:0|[1-9]\d*|__proto__)$/;

/**
 * Parts set one over the next, the theme's gap apart, in the order of `parts`' keys. Its content is an
 * object holding each part's content under the part's key.
 * @throws Error when a key looks like an integer or is `__proto__`, since its place in the order is lost.
 */
export function stack<const TParts extends Record<string, Part>>(
  parts: TParts,
): Part<v.ObjectSchema<Schemas<TParts>, undefined>> {
  const entries = Object.entries(parts);
  const unordered = entries.find(([key]) => UNORDERED_KEY.test(key));
  if (unordered !== undefined) {
    throw new Error(`A stack's part may not be keyed "${unordered[0]}". Use a key that is a name.`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries loses the keys `parts` has.
  const shape = Object.fromEntries(
    entries.map(([key, part]) => [key, part.schema]),
  ) as Schemas<TParts>;
  return {
    schema: v.object(shape),
    layout(content, theme, maxWidth) {
      let next = 0;
      const placed = entries.map(([key, part]) => {
        const block = part.layout(content[key], theme, maxWidth);
        const top = next;
        next += block.size.height + theme.gap;
        return { block, top };
      });
      return {
        size: {
          width: Math.max(0, ...placed.map(({ block }) => block.size.width)),
          height: Math.max(0, next - theme.gap),
        },
        draw: (box) =>
          placed.flatMap(({ block, top }) =>
            block.draw({ x: box.x, y: box.y + top, width: box.width, height: block.size.height }),
          ),
      };
    },
  };
}
