import * as v from "valibot";
import { layoutText, textPathData } from "../text";
import type { Block, Part } from "./part";
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
        draw: (box) => element("path", { d: textPathData(text, box.x, box.y), fill: look.color }),
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
        draw: (box) =>
          element("rect", {
            x: box.x + strokeWidth / 2,
            y: box.y + strokeWidth / 2,
            width: box.width - strokeWidth,
            height: box.height - strokeWidth,
            rx: radius,
            fill,
            stroke,
            "stroke-width": strokeWidth,
          }) +
          inner.draw({
            x: box.x + padding,
            y: box.y + padding,
            width: box.width - 2 * padding,
            height: box.height - 2 * padding,
          }),
      };
    },
  };
}

type Schemas<TParts extends Record<string, Part>> = { [K in keyof TParts]: TParts[K]["schema"] };

/**
 * Parts set one over the next, the theme's gap apart, in the order of `parts`' keys. Its content is an
 * object holding each part's content under the part's key.
 */
export function stack<const TParts extends Record<string, Part>>(
  parts: TParts,
): Part<v.ObjectSchema<Schemas<TParts>, undefined>> {
  const entries = Object.entries(parts);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries loses the keys `parts` has.
  const shape = Object.fromEntries(
    entries.map(([key, part]) => [key, part.schema]),
  ) as Schemas<TParts>;
  return {
    schema: v.object(shape),
    layout(content, theme, maxWidth) {
      const blocks: Block[] = entries.map(([key, part]) =>
        part.layout(content[key], theme, maxWidth),
      );
      const height =
        blocks.reduce((sum, block) => sum + block.size.height, 0) +
        theme.gap * Math.max(0, blocks.length - 1);
      return {
        size: { width: Math.max(0, ...blocks.map((block) => block.size.width)), height },
        draw(box) {
          let y = box.y;
          return blocks
            .map((block) => {
              const drawn = block.draw({
                x: box.x,
                y,
                width: box.width,
                height: block.size.height,
              });
              y += block.size.height + theme.gap;
              return drawn;
            })
            .join("");
        },
      };
    },
  };
}
