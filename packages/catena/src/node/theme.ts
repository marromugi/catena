import * as v from "valibot";
import { isIconName, type IconName } from "../icon";
import type { FontStack } from "../text";
import { CUSTOM_ICON, REGISTRABLE_LOGO, type CustomIcon, type RegistrableLogo } from "./logo";
import { NO_SHADOW, type Outline, type Shadow } from "./svg";

/** How a piece of text looks. `lineHeight` is a multiple of `size`. */
export interface TextLook {
  readonly weight: "regular" | "bold";
  readonly size: number;
  readonly lineHeight: number;
  readonly color: string;
}

/** How a card's frame looks. `padding` lies between the frame's edge and what it holds. */
export interface CardLook extends Outline {
  readonly padding: number;
  readonly radius: number;
}

/** How a round button looks. `padding` lies between the button's edge and what it holds. */
export interface ButtonLook extends Outline {
  readonly padding: number;
}

/** How a pill holding short text looks. Its ends are half its height round. */
export interface BadgeLook extends TextLook, Outline {
  /** Between the pill's edge and its text, at either end. */
  readonly paddingX: number;
  /** Between the pill's edge and its text, above and below. */
  readonly paddingY: number;
}

/** How an image looks. It fills the width it is given, cut to `aspectRatio` (width over height). */
export interface ImageLook {
  readonly aspectRatio: number;
  readonly radius: number;
}

/** How a divider's line looks. `dash` is the lengths of the dashes and the spaces between them; empty, the line is solid. */
export interface DividerLook {
  readonly color: string;
  readonly width: number;
  readonly dash: readonly number[];
}

/**
 * How an icon looks. It is drawn `size` across. A built-in icon, a user's one-colour icon, or letters are
 * drawn in `color`: a stroked icon's lines are `strokeWidth` wide as drawn, and a filled icon or letters
 * are filled with it. A user's logo or image keeps its own colours and widths.
 */
export interface IconLook {
  readonly size: number;
  readonly strokeWidth: number;
  readonly color: string;
  /** The colour of a built-in icon drawn in another colour than `color`. */
  readonly colors: Readonly<Partial<Record<IconName, string>>>;
}

/** The names a badge's or a status dot's colouring is chosen by. */
export const TONES = ["plain", "red"] as const;
export type Tone = (typeof TONES)[number];

export interface DotLook {
  readonly diameter: number;
  readonly colors: Readonly<Record<Tone, string>>;
}

/**
 * The looks parts share, and the logos and custom icons an icon can name. A part reads the ones it draws
 * with, so a change here reaches every kind.
 */
export interface Theme {
  readonly fonts: { readonly regular: FontStack; readonly bold: FontStack };
  /** How wide a node is laid out. */
  readonly nodeWidth: number;
  /**
   * The space between parts stacked one over the next, unless the stack is given its own gap, between
   * items of a list, and between parts set side by side in a row.
   */
  readonly gap: number;
  readonly card: CardLook;
  /** A card drawn as selected, such as the selected icon tile. */
  readonly selectedCard: CardLook;
  /** A card held in a list inside another card. */
  readonly itemCard: CardLook;
  /** A card around a section's list. */
  readonly panel: CardLook;
  /** A card around two cards side by side, such as the icon-and-title pair. */
  readonly pairPanel: CardLook;
  readonly title: TextLook;
  readonly body: TextLook;
  readonly subtitle: TextLook;
  readonly divider: DividerLook;
  readonly badges: Readonly<Record<Tone, BadgeLook>>;
  readonly dot: DotLook;
  readonly image: ImageLook;
  /** An icon set before a title. */
  readonly icon: IconLook;
  /** The space between a title and the body under it, set beside an icon. */
  readonly iconTextGap: number;
  /** The icon an icon tile holds. */
  readonly tileIcon: IconLook;
  /** The text under an icon tile; its sub-caption is in the body look. */
  readonly caption: TextLook;
  /** The space between a caption and its sub-caption, the gap of the stack holding them. */
  readonly captionGap: number;
  /** A round button around an icon. */
  readonly button: ButtonLook;
  readonly buttonIcon: IconLook;
  /** A round button in its active look. */
  readonly activeButton: ButtonLook;
  /** The disc inside an active round button, around its icon. */
  readonly activeButtonDisc: ButtonLook;
  readonly activeButtonIcon: IconLook;
  /** The logos and images an icon's content can name, by name. */
  readonly logos: Logos;
  /** The icons an icon's content can name as a bare string, beside the built-in ones. */
  readonly icons: CustomIcons;
}

/**
 * Logos and images by the names an icon's content gives them as `{ logo: "<name>" }`. catena ships none:
 * each is the caller's to use, following that brand's own guidelines.
 */
export type Logos = Readonly<Record<string, RegistrableLogo>>;

/**
 * Custom icons by the names an icon's content gives them as a bare string, as it gives a built-in icon's
 * name; no name is a built-in icon's. catena ships no logos: a logo or image here is the user's to use,
 * following that brand's own guidelines.
 */
export type CustomIcons = Readonly<Record<string, CustomIcon>>;

/** Any look of a {@link Theme} but its fonts, each given in part, and the logos it holds. */
export interface ThemeOverrides {
  readonly nodeWidth?: number;
  readonly gap?: number;
  readonly card?: Partial<CardLook>;
  readonly selectedCard?: Partial<CardLook>;
  readonly itemCard?: Partial<CardLook>;
  readonly panel?: Partial<CardLook>;
  readonly pairPanel?: Partial<CardLook>;
  readonly title?: Partial<TextLook>;
  readonly body?: Partial<TextLook>;
  readonly subtitle?: Partial<TextLook>;
  readonly divider?: Partial<DividerLook>;
  readonly badges?: { readonly [T in Tone]?: Partial<BadgeLook> };
  readonly dot?: {
    readonly diameter?: number;
    readonly colors?: Partial<Record<Tone, string>>;
  };
  readonly image?: Partial<ImageLook>;
  readonly icon?: Partial<IconLook>;
  readonly iconTextGap?: number;
  readonly tileIcon?: Partial<IconLook>;
  readonly caption?: Partial<TextLook>;
  readonly captionGap?: number;
  readonly button?: Partial<ButtonLook>;
  readonly buttonIcon?: Partial<IconLook>;
  readonly activeButton?: Partial<ButtonLook>;
  readonly activeButtonDisc?: Partial<ButtonLook>;
  readonly activeButtonIcon?: Partial<IconLook>;
  readonly logos?: Logos;
  readonly icons?: CustomIcons;
}

/** A theme was given something it can't hold. */
export class InvalidThemeError extends Error {
  override readonly name = "InvalidThemeError";
}

/** The soft shadow around a card. */
const CARD_SHADOW: Shadow = { dx: 0, dy: 0, blur: 5, color: "#000000", opacity: 0.1 };
/** The soft shadow around a card held inside another card. */
const INNER_SHADOW: Shadow = { dx: 0, dy: 1, blur: 4, color: "#000000", opacity: 0.1 };

const DEFAULT_CARD: CardLook = {
  padding: 20,
  radius: 12,
  fill: "#ffffff",
  stroke: "#ebebeb",
  strokeWidth: 1,
  shadow: CARD_SHADOW,
};
const DEFAULT_SELECTED_CARD: CardLook = {
  padding: 20,
  radius: 12,
  fill: "#fcefe0",
  stroke: "#e09644",
  strokeWidth: 1.5,
  shadow: { ...CARD_SHADOW, color: "#e09644", opacity: 0.4 },
};
const DEFAULT_ITEM_CARD: CardLook = {
  padding: 14,
  radius: 10,
  fill: "#ffffff",
  stroke: "none",
  strokeWidth: 0,
  shadow: INNER_SHADOW,
};
const DEFAULT_PANEL: CardLook = {
  padding: 12,
  radius: 12,
  fill: "#ffffff",
  stroke: "none",
  strokeWidth: 0,
  shadow: INNER_SHADOW,
};
const DEFAULT_PAIR_PANEL: CardLook = {
  padding: 22,
  radius: 14,
  fill: "#f9f9f9",
  stroke: "#ebebeb",
  strokeWidth: 1,
  shadow: CARD_SHADOW,
};
const DEFAULT_TITLE: TextLook = { weight: "bold", size: 14, lineHeight: 1.5, color: "#1f1f1f" };
const DEFAULT_BODY: TextLook = { weight: "regular", size: 11, lineHeight: 1.6, color: "#8c8c8c" };
const DEFAULT_SUBTITLE: TextLook = { weight: "bold", size: 12, lineHeight: 1.5, color: "#1f1f1f" };
const DEFAULT_DIVIDER: DividerLook = { color: "#e0e0e0", width: 1, dash: [3, 3] };

const BADGE_TEXT = {
  weight: "bold",
  size: 11,
  lineHeight: 1.5,
  paddingX: 17,
  paddingY: 3,
  strokeWidth: 1,
  shadow: NO_SHADOW,
} as const;
const DEFAULT_BADGES: Record<Tone, BadgeLook> = {
  plain: { ...BADGE_TEXT, color: "#1f1f1f", fill: "#ffffff", stroke: "#ececec" },
  red: { ...BADGE_TEXT, color: "#eb524a", fill: "#fbe5e4", stroke: "#f9dada" },
};
const DEFAULT_DOT_COLORS: Record<Tone, string> = { plain: "#8c8c8c", red: "#e93e33" };
const DEFAULT_IMAGE: ImageLook = { aspectRatio: 3 / 2, radius: 6 };
const ICON_COLORS = { spark: "#cc7c5e" } as const;
const DEFAULT_ICON: IconLook = {
  size: 22,
  strokeWidth: 1.75,
  color: "#1f1f1f",
  colors: ICON_COLORS,
};
const DEFAULT_TILE_ICON: IconLook = {
  size: 32,
  strokeWidth: 2.5,
  color: "#1f1f1f",
  colors: ICON_COLORS,
};
const DEFAULT_CAPTION: TextLook = {
  weight: "regular",
  size: 14,
  lineHeight: 1.5,
  color: "#1f1f1f",
};
const DEFAULT_BUTTON: ButtonLook = {
  padding: 9,
  fill: "#ffffff",
  stroke: "#ececec",
  strokeWidth: 1.5,
  shadow: NO_SHADOW,
};
const DEFAULT_BUTTON_ICON: IconLook = {
  size: 16,
  strokeWidth: 1.75,
  color: "#1f1f1f",
  colors: ICON_COLORS,
};
const DEFAULT_ACTIVE_BUTTON: ButtonLook = {
  ...DEFAULT_BUTTON,
  padding: 9.5,
  fill: "#dce6fd",
  stroke: "#4666f6",
};
const DEFAULT_ACTIVE_BUTTON_DISC: ButtonLook = {
  padding: 1.5,
  fill: "#3254f6",
  stroke: "none",
  strokeWidth: 0,
  shadow: NO_SHADOW,
};
const DEFAULT_ACTIVE_BUTTON_ICON: IconLook = {
  ...DEFAULT_BUTTON_ICON,
  size: 12,
  color: "#ffffff",
  colors: {},
};

function laidOver<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  const given = Object.entries(overrides).filter(([, value]) => value !== undefined);
  return { ...defaults, ...Object.fromEntries(given) };
}

/**
 * Each of `given`'s entries checked against `schema`, the one an icon's inline content is checked
 * against; `noun` names one entry, and `forms` what it may be, in the error.
 */
function checkedByName<TSchema extends v.GenericSchema>(
  given: Readonly<Record<string, unknown>>,
  schema: TSchema,
  noun: string,
  forms: string,
): Readonly<Record<string, v.InferOutput<TSchema>>> {
  const prototype: unknown = Object.getPrototypeOf(given);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InvalidThemeError(
      `The ${noun}s are not an object holding each ${noun} under its name.`,
    );
  }
  return Object.fromEntries(
    Object.entries(given).map(([name, entry]) => {
      const parsed = v.safeParse(schema, entry);
      if (!parsed.success) {
        throw new InvalidThemeError(
          `The ${noun} "${name}" is ${forms}: ${v.summarize(parsed.issues)}`,
          { cause: new v.ValiError(parsed.issues) },
        );
      }
      return [name, parsed.output];
    }),
  );
}

function checkedIcons(icons: CustomIcons): CustomIcons {
  const checked = checkedByName(
    icons,
    CUSTOM_ICON,
    "icon",
    "none of: an OwnIcon, an OwnLogo, an OwnImage",
  );
  const builtIn = Object.keys(checked).find(isIconName);
  if (builtIn !== undefined) {
    throw new InvalidThemeError(`The icon "${builtIn}" has a built-in icon's name.`);
  }
  return checked;
}

/**
 * The default looks with `overrides` laid over them, and the logos and custom icons `overrides` gives,
 * each checked. A look given as `undefined` keeps its default.
 * @throws InvalidThemeError when a logo in `overrides.logos` is neither an `OwnLogo` nor an `OwnImage`, or
 * an icon in `overrides.icons` is none of an `OwnIcon`, an `OwnLogo`, an `OwnImage`, or has a built-in
 * icon's name.
 */
export function defineTheme(fonts: Theme["fonts"], overrides: ThemeOverrides = {}): Theme {
  return {
    fonts,
    nodeWidth: overrides.nodeWidth ?? 320,
    gap: overrides.gap ?? 12,
    card: laidOver(DEFAULT_CARD, overrides.card),
    selectedCard: laidOver(DEFAULT_SELECTED_CARD, overrides.selectedCard),
    itemCard: laidOver(DEFAULT_ITEM_CARD, overrides.itemCard),
    panel: laidOver(DEFAULT_PANEL, overrides.panel),
    pairPanel: laidOver(DEFAULT_PAIR_PANEL, overrides.pairPanel),
    title: laidOver(DEFAULT_TITLE, overrides.title),
    body: laidOver(DEFAULT_BODY, overrides.body),
    subtitle: laidOver(DEFAULT_SUBTITLE, overrides.subtitle),
    divider: laidOver(DEFAULT_DIVIDER, overrides.divider),
    badges: {
      plain: laidOver(DEFAULT_BADGES.plain, overrides.badges?.plain),
      red: laidOver(DEFAULT_BADGES.red, overrides.badges?.red),
    },
    dot: {
      diameter: overrides.dot?.diameter ?? 18,
      colors: laidOver(DEFAULT_DOT_COLORS, overrides.dot?.colors),
    },
    image: laidOver(DEFAULT_IMAGE, overrides.image),
    icon: laidOver(DEFAULT_ICON, overrides.icon),
    iconTextGap: overrides.iconTextGap ?? 2,
    tileIcon: laidOver(DEFAULT_TILE_ICON, overrides.tileIcon),
    caption: laidOver(DEFAULT_CAPTION, overrides.caption),
    captionGap: overrides.captionGap ?? 2,
    button: laidOver(DEFAULT_BUTTON, overrides.button),
    buttonIcon: laidOver(DEFAULT_BUTTON_ICON, overrides.buttonIcon),
    activeButton: laidOver(DEFAULT_ACTIVE_BUTTON, overrides.activeButton),
    activeButtonDisc: laidOver(DEFAULT_ACTIVE_BUTTON_DISC, overrides.activeButtonDisc),
    activeButtonIcon: laidOver(DEFAULT_ACTIVE_BUTTON_ICON, overrides.activeButtonIcon),
    logos: checkedByName(
      overrides.logos ?? {},
      REGISTRABLE_LOGO,
      "logo",
      "neither a logo nor an image",
    ),
    icons: checkedIcons(overrides.icons ?? {}),
  };
}
