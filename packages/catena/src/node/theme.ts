import type { FontStack } from "../text";

/** How a piece of text looks. `lineHeight` is a multiple of `size`. */
export interface TextLook {
  readonly weight: "regular" | "bold";
  readonly size: number;
  readonly lineHeight: number;
  readonly color: string;
}

/** How a card's frame looks. `padding` lies between the frame's edge and what it holds. */
export interface CardLook {
  readonly padding: number;
  readonly radius: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/** The looks parts share. A part reads the ones it draws with, so a change here reaches every kind. */
export interface Theme {
  readonly fonts: { readonly regular: FontStack; readonly bold: FontStack };
  /** How wide a node is laid out. */
  readonly nodeWidth: number;
  /** The space between parts stacked one over the next. */
  readonly gap: number;
  readonly card: CardLook;
  readonly title: TextLook;
  readonly body: TextLook;
}

/** Any look of a {@link Theme} but its fonts, each given in part. */
export interface ThemeOverrides {
  readonly nodeWidth?: number;
  readonly gap?: number;
  readonly card?: Partial<CardLook>;
  readonly title?: Partial<TextLook>;
  readonly body?: Partial<TextLook>;
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

/** The default looks with `overrides` laid over them. */
export function defineTheme(fonts: Theme["fonts"], overrides: ThemeOverrides = {}): Theme {
  return {
    fonts,
    nodeWidth: overrides.nodeWidth ?? 320,
    gap: overrides.gap ?? 12,
    card: { ...DEFAULT_CARD, ...overrides.card },
    title: { ...DEFAULT_TITLE, ...overrides.title },
    body: { ...DEFAULT_BODY, ...overrides.body },
  };
}
