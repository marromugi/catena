import * as v from "valibot";
import type { Rect } from "../layout";
import type { Leaf } from "../place";
import type { Part } from "./part";
import {
  atWidth,
  centered,
  fitted,
  frame,
  list,
  optional,
  panel,
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
import { element, idsOfNode, writeSvg } from "./svg";
import type { CardLook, Theme } from "./theme";

/** The content given for a node is not what its kind shows. */
export class InvalidNodeContentError extends Error {
  override readonly name = "InvalidNodeContentError";
}

/** A node of some kind, measured: the `Leaf` to give `placeGraph`, and how to draw it at its placed box. */
export interface Node {
  readonly leaf: Leaf;
  /**
   * The node as SVG elements, in a `<g>`. The ids its elements carry are unique among the nodes of one
   * graph; nodes of two graphs, or the same node drawn twice, in one document can repeat them.
   */
  draw(box: Rect): string;
}

/** A card with a title over wrapping body text. */
export const titleBodyCard = frame(stack({ title, body: bodyText }));

/** A card with a title, and a badge at its end on the nodes that have one. */
export const titleBadgeCard = frame(row({ title, badge: optional(redBadge) }, { grow: "title" }));

/** A card with a title over wrapping body text, and a badge under the body on the nodes that have one. */
export const titleBodyBadgeCard = frame(
  stack({ title, body: bodyText, badge: optional(redBadge) }),
);

/** A card with an image over a title over wrapping body text. */
export const imageTitleBodyCard = frame(stack({ image, title, body: bodyText }));

/** A card with a title, and a status dot before it on the nodes that have a status. */
export const statusTitleCard = frame(
  row({ status: optional(statusDot), title }, { grow: "title" }),
);

/** A card in the theme's item card look, holding a line of text. */
export const itemCard = frame(subtitle, (theme) => theme.itemCard);

/**
 * A card with a title over wrapping body text, a list of item cards, a divider, and a section whose item
 * cards sit in a panel.
 */
export const titleBodyItemsSectionCard = frame(
  stack({
    title,
    body: bodyText,
    items: list(itemCard),
    divider,
    section: section(panel(list(itemCard))),
  }),
);

/** A card with an icon before a title. */
export const iconTitleCard = frame(row({ icon, title }, { grow: "title" }));

/** A card with an icon before a title over wrapping body text, the icon set beside the title. */
export const iconTitleBodyCard = frame(
  row({ icon, text: stack({ title, body: bodyText }) }, { grow: "text", align: "start" }),
);

/** A panel holding two icon-and-title cards side by side, each as wide as a node. */
export const iconTitleCardPair = panel(
  row({
    first: atWidth(iconTitleCard, (theme) => theme.nodeWidth),
    second: atWidth(iconTitleCard, (theme) => theme.nodeWidth),
  }),
);

/**
 * An icon in a square card in the look `lookOf` picks from the theme, as large as the icon and its
 * padding, with a caption and a sub-caption centred under it on the nodes that have them.
 */
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
          caption: optional(centered(textPart((theme) => theme.caption))),
          subcaption: optional(centered(bodyText)),
        },
        { gap: (theme) => theme.captionGap },
      ),
    ),
  });
}

/** An icon tile, with its caption and sub-caption: `{ icon, label: { caption, subcaption } }`. */
export const iconTile = iconTileIn((theme) => theme.card);

/** An icon tile drawn as selected. Its content is the same as {@link iconTile}'s. */
export const selectedIconTile = iconTileIn((theme) => theme.selectedCard);

/** A small round button holding an icon. */
export const roundButton = fitted(
  iconPart((theme) => theme.buttonIcon),
  (theme) => theme.button,
);

/** A small round button in its active look. Its content is the same as {@link roundButton}'s. */
export const activeRoundButton = fitted(
  iconPart((theme) => theme.activeButtonIcon),
  (theme) => theme.activeButton,
);

/**
 * Checks `content` against `kind`'s schema and lays the node out at the theme's node width.
 * @throws InvalidNodeContentError when `content` does not match the schema, with the ValiError as its cause.
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
  const block = kind.layout(parsed.output, theme, theme.nodeWidth);
  return {
    leaf: { id, size: block.size },
    draw: (box) => writeSvg(element("g", {}, block.draw(box, idsOfNode(id)))),
  };
}
