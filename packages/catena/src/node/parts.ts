import * as v from "valibot";
import { iconGrid, iconNames, iconPathData, iconStroke } from "../icon";
import type { Rect } from "../layout";
import { layoutText, textPathData, type TextLayout } from "../text";
import {
  OWN_IMAGE,
  OWN_LOGO,
  REGISTERED_LOGO,
  UnknownLogoError,
  VIEW_BOX,
  type OwnImage,
  type OwnLogo,
  type RegisteredLogo,
} from "./logo";
import type { Part } from "./part";
import { element, outlinedRect, type SvgElement } from "./svg";
import {
  TONES,
  type BadgeLook,
  type IconLook,
  type ImageLook,
  type TextLook,
  type Theme,
} from "./theme";

const TEXT = v.string();

function setText(content: string, look: TextLook, theme: Theme, maxWidth: number): TextLayout {
  return layoutText(content, {
    fonts: theme.fonts[look.weight],
    size: look.size,
    lineHeight: look.lineHeight,
    maxWidth,
  });
}

/** `text`'s outlines with each line centred across `box`. */
function centredLines(text: TextLayout, box: Rect): string {
  const { size, lineHeight } = text.style;
  return text.lines
    .map((line, index) =>
      textPathData(
        { ...text, lines: [line], width: line.width },
        box.x + (box.width - line.width) / 2,
        box.y + index * size * lineHeight,
      ),
    )
    .join("");
}

/**
 * A part showing a string, wrapped to the width it is given, in the look `lookOf` picks from the theme.
 * Its lines start at the left of its box, or are each centred across it when `align` is `"center"`.
 */
export function textPart(
  lookOf: (theme: Theme) => TextLook,
  options: { readonly align?: "start" | "center" } = {},
): Part<typeof TEXT> {
  const { align = "start" } = options;
  return {
    schema: TEXT,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const text = setText(content, look, theme, maxWidth);
      return {
        size: { width: text.width, height: text.height },
        draw: (box) => [
          element("path", {
            d: align === "center" ? centredLines(text, box) : textPathData(text, box.x, box.y),
            fill: look.color,
          }),
        ],
      };
    },
  };
}

export const title = textPart((theme) => theme.title);

export const bodyText = textPart((theme) => theme.body);

/** Text a step smaller than a title: an item card's text, and a section's heading. */
export const subtitle = textPart((theme) => theme.subtitle);

const NOTHING = v.optional(v.undefined());

/**
 * A line across the width it is given, in the theme's divider look. It shows nothing, so a stack holding
 * it takes no content under its key.
 */
export const divider: Part<typeof NOTHING> = {
  schema: NOTHING,
  layout(_, theme, maxWidth) {
    const { color, width, dash } = theme.divider;
    return {
      size: { width: Math.max(0, maxWidth), height: width },
      draw: (box) => [
        element("line", {
          x1: box.x,
          y1: box.y + width / 2,
          x2: box.x + box.width,
          y2: box.y + width / 2,
          stroke: color,
          "stroke-width": width,
          ...(dash.length === 0 ? {} : { "stroke-dasharray": dash.join(" ") }),
        }),
      ],
    };
  },
};

/**
 * A pill holding a string, in the look `lookOf` picks from the theme. It is as wide as its text, and
 * draws at the top-left of the box it is given.
 */
export function badgePart(lookOf: (theme: Theme) => BadgeLook): Part<typeof TEXT> {
  return {
    schema: TEXT,
    layout(content, theme, maxWidth) {
      const look = lookOf(theme);
      const text = setText(content, look, theme, maxWidth - 2 * look.paddingX);
      const size = {
        width: text.width + 2 * look.paddingX,
        height: text.height + 2 * look.paddingY,
      };
      return {
        size,
        draw: (box, newId) => [
          ...outlinedRect({ x: box.x, y: box.y, ...size }, size.height / 2, look, newId),
          element("path", {
            d: textPathData(text, box.x + look.paddingX, box.y + look.paddingY),
            fill: look.color,
          }),
        ],
      };
    },
  };
}

export const badge = badgePart((theme) => theme.badges.plain);

export const redBadge = badgePart((theme) => theme.badges.red);

const TONE = v.picklist(TONES);

/** A dot whose content is its tone, coloured as the theme colours that tone. Draws at the top-left of its box. */
export const statusDot: Part<typeof TONE> = {
  schema: TONE,
  layout(tone, theme) {
    const { diameter, colors } = theme.dot;
    return {
      size: { width: diameter, height: diameter },
      draw: (box) => [
        element("circle", {
          cx: box.x + diameter / 2,
          cy: box.y + diameter / 2,
          r: diameter / 2,
          fill: colors[tone],
        }),
      ],
    };
  },
};

const HREF = v.string();

/**
 * An image whose content is its href, written into the SVG as given: catena never fetches it. It fills
 * the width it is given at the look's aspect ratio, cut to that shape about its centre, with round
 * corners, and draws at the top-left of its box.
 */
export function imagePart(lookOf: (theme: Theme) => ImageLook): Part<typeof HREF> {
  return {
    schema: HREF,
    layout(href, theme, maxWidth) {
      const { aspectRatio, radius } = lookOf(theme);
      const width = Math.max(0, maxWidth);
      const size = { width, height: width / aspectRatio };
      return {
        size,
        draw: (box, newId) => {
          const area = { x: box.x, y: box.y, ...size };
          const clip = newId();
          return [
            element("clipPath", { id: clip }, [element("rect", { ...area, rx: radius })]),
            element("image", {
              ...area,
              href,
              preserveAspectRatio: "xMidYMid slice",
              "clip-path": `url(#${clip})`,
            }),
          ];
        },
      };
    },
  };
}

export const image = imagePart((theme) => theme.image);

/**
 * A user's own icon: path data in the area `viewBox` names, as an SVG `viewBox` does, either stroked as
 * the built-in icons are or filled, in the look's colour.
 */
const OWN_ICON = v.strictObject({
  pathData: v.string(),
  viewBox: VIEW_BOX,
  paint: v.picklist(["stroke", "fill"]),
});
export type OwnIcon = v.InferOutput<typeof OWN_ICON>;

const ICON = v.union([v.picklist(iconNames), OWN_ICON, OWN_LOGO, OWN_IMAGE, REGISTERED_LOGO]);

const BUILT_IN_VIEW_BOX = { x: 0, y: 0, width: iconGrid, height: iconGrid };

/**
 * An icon in the look `lookOf` picks from the theme. It is the look's size across and draws at the
 * top-left of its box. Its content is one of:
 * - a built-in icon's name;
 * - the user's own icon ({@link OwnIcon}), in the look's colour;
 * - the user's own logo of shapes ({@link OwnLogo}), each in the colour it gives;
 * - the user's own image ({@link OwnImage}), drawn whole, fitted and centred in the square;
 * - the name of a logo or image registered on the theme ({@link RegisteredLogo}), drawn as that logo or
 *   image given here would be.
 * An icon or logo has its view box scaled to fit the square and centred in it.
 *
 * catena ships no logos: a logo or image is one the caller passes, and theirs to use, following that
 * brand's own guidelines.
 * @throws UnknownLogoError from `layout` when the content names a logo the theme does not hold.
 */
export function iconPart(lookOf: (theme: Theme) => IconLook): Part<typeof ICON> {
  return {
    schema: ICON,
    layout(given, theme) {
      const look = lookOf(theme);
      const { size } = look;
      const content = typeof given === "object" && "logo" in given ? logoOn(theme, given) : given;
      return {
        size: { width: size, height: size },
        draw: (box) => {
          if (typeof content === "string") {
            const ink = look.colors[content] ?? look.color;
            return [
              oneColourIcon(iconPathData[content], BUILT_IN_VIEW_BOX, "stroke", ink, look, box),
            ];
          }
          if ("href" in content) {
            const { href } = content;
            return [
              element("image", {
                x: box.x,
                y: box.y,
                width: size,
                height: size,
                href,
                preserveAspectRatio: "xMidYMid meet",
              }),
            ];
          }
          if ("shapes" in content) {
            const { transform } = fitViewBox(content.viewBox, size, box);
            return [
              element(
                "g",
                { transform },
                content.shapes.map((shape) =>
                  shape.paint === "fill"
                    ? element("path", { d: shape.pathData, fill: shape.color })
                    : element("path", {
                        d: shape.pathData,
                        ...iconStroke,
                        stroke: shape.color,
                        "stroke-width": shape.width,
                      }),
                ),
              ),
            ];
          }
          return [
            oneColourIcon(content.pathData, content.viewBox, content.paint, look.color, look, box),
          ];
        },
      };
    },
  };
}

function logoOn(theme: Theme, { logo }: RegisteredLogo): OwnLogo | OwnImage {
  const found = Object.hasOwn(theme.logos, logo) ? theme.logos[logo] : undefined;
  if (found === undefined) throw new UnknownLogoError(logo);
  return found;
}

/** The transform that scales `viewBox` to fit a square `size` across at the top-left of `box`, centred in it. */
function fitViewBox(
  viewBox: OwnIcon["viewBox"],
  size: number,
  box: Rect,
): { transform: string; scale: number } {
  const longest = Math.max(viewBox.width, viewBox.height);
  const scale = size / longest;
  const left = (size * (1 - viewBox.width / longest)) / 2 - viewBox.x * scale;
  const top = (size * (1 - viewBox.height / longest)) / 2 - viewBox.y * scale;
  return { transform: `translate(${box.x + left} ${box.y + top}) scale(${scale})`, scale };
}

function oneColourIcon(
  pathData: string,
  viewBox: OwnIcon["viewBox"],
  paint: OwnIcon["paint"],
  ink: string,
  { size, strokeWidth }: IconLook,
  box: Rect,
): SvgElement {
  const { transform, scale } = fitViewBox(viewBox, size, box);
  return element("path", {
    d: pathData,
    transform,
    ...(paint === "fill"
      ? { fill: ink }
      : { ...iconStroke, stroke: ink, "stroke-width": strokeWidth / scale }),
  });
}

/** The icon set before a title. */
export const icon = iconPart((theme) => theme.icon);
