import type { FontStack } from "../text";
import type { Outline } from "./svg";

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

/** How a pill holding short text looks. Its ends are half its height round. */
export interface BadgeLook extends TextLook, Outline {
  /** Between the pill's edge and its text, at either end. */
  readonly paddingX: number;
  /** Between the pill's edge and its text, above and below. */
  readonly paddingY: number;
}

/** The names a badge's or a status dot's colouring is chosen by. */
export const TONES = ["plain", "red"] as const;
export type Tone = (typeof TONES)[number];

export interface DotLook {
  readonly diameter: number;
  readonly colors: Readonly<Record<Tone, string>>;
}

/** The looks parts share. A part reads the ones it draws with, so a change here reaches every kind. */
export interface Theme {
  readonly fonts: { readonly regular: FontStack; readonly bold: FontStack };
  /** How wide a node is laid out. */
  readonly nodeWidth: number;
  /** The space between parts stacked one over the next, and between parts set side by side in a row. */
  readonly gap: number;
  readonly card: CardLook;
  readonly title: TextLook;
  readonly body: TextLook;
  readonly badges: Readonly<Record<Tone, BadgeLook>>;
  readonly dot: DotLook;
}

/** Any look of a {@link Theme} but its fonts, each given in part. */
export interface ThemeOverrides {
  readonly nodeWidth?: number;
  readonly gap?: number;
  readonly card?: Partial<CardLook>;
  readonly title?: Partial<TextLook>;
  readonly body?: Partial<TextLook>;
  readonly badges?: { readonly [T in Tone]?: Partial<BadgeLook> };
  readonly dot?: {
    readonly diameter?: number;
    readonly colors?: Partial<Record<Tone, string>>;
  };
}

const DEFAULT_CARD: CardLook = {
  padding: 20,
  radius: 8,
  fill: "#ffffff",
  stroke: "#e6e6e6",
  strokeWidth: 1,
};
const DEFAULT_TITLE: TextLook = { weight: "bold", size: 14, lineHeight: 1.5, color: "#1f1f1f" };
const DEFAULT_BODY: TextLook = { weight: "regular", size: 11, lineHeight: 1.6, color: "#8c8c8c" };

const BADGE_TEXT = {
  weight: "bold",
  size: 10,
  lineHeight: 1.4,
  paddingX: 16,
  paddingY: 3,
} as const;
const DEFAULT_BADGES: Record<Tone, BadgeLook> = {
  plain: { ...BADGE_TEXT, color: "#1f1f1f", fill: "#ffffff", stroke: "#e6e6e6", strokeWidth: 1 },
  red: { ...BADGE_TEXT, color: "#e5484d", fill: "#fde4e4", stroke: "#fbd0d0", strokeWidth: 1 },
};
const DEFAULT_DOT_COLORS: Record<Tone, string> = { plain: "#8c8c8c", red: "#e5484d" };

function laidOver<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  const given = Object.entries(overrides).filter(([, value]) => value !== undefined);
  return { ...defaults, ...Object.fromEntries(given) };
}

/** The default looks with `overrides` laid over them. A look given as `undefined` keeps its default. */
export function defineTheme(fonts: Theme["fonts"], overrides: ThemeOverrides = {}): Theme {
  return {
    fonts,
    nodeWidth: overrides.nodeWidth ?? 320,
    gap: overrides.gap ?? 12,
    card: laidOver(DEFAULT_CARD, overrides.card),
    title: laidOver(DEFAULT_TITLE, overrides.title),
    body: laidOver(DEFAULT_BODY, overrides.body),
    badges: {
      plain: laidOver(DEFAULT_BADGES.plain, overrides.badges?.plain),
      red: laidOver(DEFAULT_BADGES.red, overrides.badges?.red),
    },
    dot: {
      diameter: overrides.dot?.diameter ?? 16,
      colors: laidOver(DEFAULT_DOT_COLORS, overrides.dot?.colors),
    },
  };
}
