import * as v from "valibot";
import type { Point, Rect } from "../layout";
import type { Leaf } from "../place";
import { element, writeSvg } from "../svg";
import { UnknownIconError, UnknownLogoError } from "./logo";
import type { Part } from "./part";
import {
  atWidth,
  centered,
  fitted,
  frame,
  list,
  optional,
  panel,
  pill,
  row,
  section,
  stack,
} from "./containers";
import {
  bodyText,
  divider,
  icon,
  iconPart,
  image,
  redBadge,
  statusDot,
  subtitle,
  textPart,
  title,
} from "./parts";
import { onFilledRectSide, idsOfNode } from "./svg";
import type { CardLook, Theme } from "./theme";

export class InvalidNodeContentError extends Error {
  override readonly name = "InvalidNodeContentError";
}

export interface Node {
  readonly leaf: Leaf;
  /**
   * The node as SVG elements, in a `<g>`. The ids its elements carry are unique among the nodes of one
   * graph; nodes of two graphs, or the same node drawn twice, in one document can repeat them.
   */
  draw(box: Rect): string;
  /** Whether `point` is on a side of a filled card the node draws in `box`, between its corners. */
  covers(box: Rect, point: Point): boolean;
}

export const titleBodyCard = frame(stack({ title, body: bodyText }));

export const titleBadgeCard = frame(row({ title, badge: optional(redBadge) }, { grow: "title" }));

export const titleBodyBadgeCard = frame(
  stack({ title, body: bodyText, badge: optional(redBadge) }),
);

export const imageTitleBodyCard = frame(stack({ image, title, body: bodyText }));

export const statusTitleCard = frame(
  row({ status: optional(statusDot), title }, { grow: "title" }),
);

export const itemCard = frame(subtitle, (theme) => theme.itemCard);

export const titleBodyItemsSectionCard = frame(
  stack({
    title,
    body: bodyText,
    items: list(itemCard),
    divider,
    section: section(panel(list(itemCard))),
  }),
);

export const iconTitleCard = frame(row({ icon, title }, { grow: "title" }));

export const iconTitleBodyCard = frame(
  row(
    { icon, text: stack({ title, body: bodyText }, { gap: (theme) => theme.iconTextGap }) },
    { grow: "text", align: "start" },
  ),
);

export const iconTitleCardPair = frame(
  row(
    {
      first: atWidth(iconTitleCard, (theme) => theme.nodeWidth),
      second: atWidth(iconTitleCard, (theme) => theme.nodeWidth),
    },
    { align: "stretch" },
  ),
  (theme) => theme.pairPanel,
);

function iconTileIn(lookOf: (theme: Theme) => CardLook) {
  return stack({
    icon: centered(
      fitted(
        iconPart((theme) => theme.tileIcon),
        lookOf,
      ),
    ),
    label: optional(
      stack(
        {
          caption: optional(textPart((theme) => theme.caption, { align: "center" })),
          subcaption: optional(textPart((theme) => theme.body, { align: "center" })),
        },
        { gap: (theme) => theme.captionGap },
      ),
    ),
  });
}

export const iconTile = iconTileIn((theme) => theme.card);

export const selectedIconTile = iconTileIn((theme) => theme.selectedCard);

export const roundButton = pill(
  iconPart((theme) => theme.buttonIcon),
  (theme) => theme.button,
);

export const activeRoundButton = pill(
  pill(
    iconPart((theme) => theme.activeButtonIcon),
    (theme) => theme.activeButtonDisc,
  ),
  (theme) => theme.activeButton,
);

/**
 * @throws InvalidNodeContentError when `content` does not match the schema, with the ValiError as its cause,
 * names a logo the theme does not hold, with the UnknownLogoError as its cause, or is a name neither built
 * in nor one of the theme's custom icons, with the UnknownIconError as its cause.
 * @throws UnreadableFontError when a typeface's data turns out to be damaged.
 */
export function buildNode<TSchema extends v.GenericSchema>(
  kind: Part<TSchema>,
  theme: Theme,
  id: string,
  content: v.InferInput<TSchema>,
): Node {
  const parsed = v.safeParse(kind.schema, content);
  if (!parsed.success) {
    throw new InvalidNodeContentError(
      `The content of node "${id}" does not match its kind: ${v.summarize(parsed.issues)}`,
      { cause: new v.ValiError(parsed.issues) },
    );
  }
  const block = layoutNode(kind, parsed.output, theme, id);
  return {
    leaf: { id, size: block.size },
    draw: (box) => writeSvg(element("g", {}, block.draw(box, idsOfNode(id)))),
    covers: (box, point) => onFilledRectSide(block.draw(box, idsOfNode(id)), point),
  };
}

function layoutNode<TSchema extends v.GenericSchema>(
  kind: Part<TSchema>,
  content: v.InferOutput<TSchema>,
  theme: Theme,
  id: string,
) {
  try {
    return kind.layout(content, theme, theme.nodeWidth);
  } catch (error) {
    if (error instanceof UnknownLogoError) {
      throw new InvalidNodeContentError(
        `The content of node "${id}" names the logo "${error.logo}", which the theme does not hold.`,
        { cause: error },
      );
    }
    if (error instanceof UnknownIconError) {
      throw new InvalidNodeContentError(
        `The content of node "${id}" names the icon "${error.icon}", which is neither a built-in icon nor a custom one.`,
        { cause: error },
      );
    }
    throw error;
  }
}
