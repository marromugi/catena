import { iconGrid, iconPathData, iconStroke } from "../icon";
import { element, type SvgElement, type TextLook, type Theme } from "../node";
import { layoutText, textPathData, type TextLayout } from "../text";
import { GITHUB_MARK } from "./github-mark";

/** The repository a diagram was drawn from, as its header names it. */
export interface HeaderRepository {
  readonly name: string;
  /**
   * `"github"` draws the GitHub mark before `name`, for a repository on GitHub. The mark is GitHub's
   * trademark: use it only for that, following https://brand.github.com/foundations/logo.
   */
  readonly mark?: "github";
}

/**
 * A band across the top of a diagram: `title` at its left; at its right `repository`, then a clock and
 * `capturedAt`, written as given. Each text is set in `fonts` on one line, each run of spaces and line
 * breaks drawn as one space; a text left out, holding only spaces, or whose glyphs draw nothing is not
 * drawn.
 *
 * When they don't all fit, the capture time keeps its whole width first, then the repository, then the
 * title, each from what the one before left. A text wider than its room is cut to the longest start that
 * fits with `…` after it, and left out when no start that draws something fits with `…`; the clock goes
 * with its time, and the repository's mark with its name, each kept whole.
 */
export interface DiagramHeader {
  readonly fonts: Theme["fonts"];
  readonly title?: string;
  readonly repository?: HeaderRepository;
  readonly capturedAt?: string;
}

const LOOK = {
  height: 72,
  paddingX: 40,
  radius: 24,
  fill: "#ffffff",
  stroke: "#ebebeb",
  strokeWidth: 1,
  shadow: { dx: 0, dy: 4, blur: 8, color: "#000000", opacity: 0.08 },
  title: { weight: "bold", size: 12, lineHeight: 1.5, color: "#1f1f1f" },
  detail: { weight: "regular", size: 12, lineHeight: 1.5, color: "#8c8c8c" },
  clock: { size: 18, strokeWidth: 1.75, color: "#b3b3b3" },
  /** Between the clock and the time after it. */
  iconGap: 8,
  /** Black on the white band: the brand allows the mark black or white only. */
  githubMark: { size: 22, gap: 10, color: "#000000" },
  /** Between the title, the repository and the clock, next to each other. */
  itemGap: 40,
} as const;

/** How far a header pushes the layout down. */
export const HEADER_HEIGHT = LOOK.height;

/** The id of the header's shadow filter. A node's ids end in a count, so none is this one. */
const SHADOW_ID = "catena-header-shadow";

/**
 * The header's shadow. Its region is in units of the band's own box, so it is the same in every document
 * and one of them serves every header inlined in a page. Half the band's height above and below holds the
 * shadow's offset and three times its blur.
 */
const SHADOW_FILTER = element(
  "filter",
  {
    id: SHADOW_ID,
    filterUnits: "objectBoundingBox",
    x: -0.1,
    y: -0.5,
    width: 1.2,
    height: 2,
  },
  [
    element("feDropShadow", {
      dx: LOOK.shadow.dx,
      dy: LOOK.shadow.dy,
      stdDeviation: LOOK.shadow.blur,
      "flood-color": LOOK.shadow.color,
      "flood-opacity": LOOK.shadow.opacity,
    }),
  ],
);

const ELLIPSIS = "…";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The header across a document `width` wide, flush with its top, its bottom corners round. */
export function drawHeader(width: number, header: DiagramHeader): SvgElement[] {
  const { paddingX, itemGap } = LOOK;
  const drawn = [...band(width)];
  let end = width - paddingX;
  const time = endingAt(end, header.capturedAt, LOOK.detail, header, CLOCK);
  if (time !== undefined) {
    drawn.push(...time.drawn);
    end = time.left - itemGap;
  }
  const repository = endingAt(
    end,
    header.repository?.name,
    LOOK.detail,
    header,
    header.repository?.mark === "github" ? GITHUB_MARK_ICON : undefined,
  );
  if (repository !== undefined) {
    drawn.push(...repository.drawn);
    end = repository.left - itemGap;
  }
  const title = fitted(header.title, LOOK.title, header, end - paddingX);
  if (title !== undefined) drawn.push(drawnText(title, paddingX, LOOK.title));
  return drawn;
}

/** Where `size` starts for it to sit in the middle of the band. */
const middle = (size: number) => (LOOK.height - size) / 2;

const drawnText = (set: TextLayout, x: number, look: TextLook) =>
  element("path", { d: textPathData(set, x, middle(set.height)), fill: look.color });

/** An icon drawn `gap` before the text it goes with, in a box `size` across. */
interface LeadingIcon {
  readonly size: number;
  readonly gap: number;
  draw(x: number, y: number): SvgElement;
}

/**
 * `content` set to end at `end`, after `icon` when there is one: what is drawn and where its left end is,
 * or nothing when the text is not drawn, and then no icon either.
 */
function endingAt(
  end: number,
  content: string | undefined,
  look: TextLook,
  header: DiagramHeader,
  icon?: LeadingIcon,
): { drawn: SvgElement[]; left: number } | undefined {
  const iconWidth = icon === undefined ? 0 : icon.size + icon.gap;
  const set = fitted(content, look, header, end - LOOK.paddingX - iconWidth);
  if (set === undefined) return undefined;
  const x = end - set.width;
  if (icon === undefined) return { drawn: [drawnText(set, x, look)], left: x };
  const iconX = x - icon.gap - icon.size;
  return { drawn: [icon.draw(iconX, middle(icon.size)), drawnText(set, x, look)], left: iconX };
}

/** The white band and its shadow; its stroke lies inside the band and stops at the document's top. */
function band(width: number): SvgElement[] {
  const { height, strokeWidth, radius } = LOOK;
  const inset = strokeWidth / 2;
  const left = inset;
  const right = width - inset;
  const bottom = height - inset;
  const r = Math.max(0, Math.min(radius, (right - left) / 2, bottom));
  const d =
    `M${left} 0V${bottom - r}A${r} ${r} 0 0 0 ${left + r} ${bottom}` +
    `H${right - r}A${r} ${r} 0 0 0 ${right} ${bottom - r}V0`;
  return [
    SHADOW_FILTER,
    element("path", {
      d,
      fill: LOOK.fill,
      stroke: LOOK.stroke,
      "stroke-width": strokeWidth,
      filter: `url(#${SHADOW_ID})`,
    }),
  ];
}

const CLOCK: LeadingIcon = {
  size: LOOK.clock.size,
  gap: LOOK.iconGap,
  draw(x, y) {
    const { size, strokeWidth, color } = LOOK.clock;
    const scale = size / iconGrid;
    return element("path", {
      d: iconPathData.clock,
      transform: `translate(${x} ${y}) scale(${scale})`,
      ...iconStroke,
      stroke: color,
      "stroke-width": strokeWidth / scale,
    });
  },
};

/** The mark as it is, scaled evenly into its box, filled in one colour, with no stroke or filter. */
const GITHUB_MARK_ICON: LeadingIcon = {
  size: LOOK.githubMark.size,
  gap: LOOK.githubMark.gap,
  draw: (x, y) =>
    element("path", {
      d: GITHUB_MARK.pathData,
      transform: `translate(${x} ${y}) scale(${LOOK.githubMark.size / GITHUB_MARK.grid})`,
      fill: LOOK.githubMark.color,
    }),
};

const drawsNothing = (text: TextLayout) => textPathData(text, 0, 0) === "";

/** `content` on one line no wider than `room`, cut as {@link DiagramHeader} says, or nothing to draw. */
function fitted(
  content: string | undefined,
  look: TextLook,
  header: DiagramHeader,
  room: number,
): TextLayout | undefined {
  const line = content?.replaceAll(/\s+/g, " ").trim() ?? "";
  if (line === "") return undefined;
  const set = (text: string) =>
    layoutText(text, {
      fonts: header.fonts[look.weight],
      size: look.size,
      lineHeight: look.lineHeight,
      maxWidth: Infinity,
    });
  const whole = set(line);
  if (drawsNothing(whole)) return undefined;
  if (whole.width <= room) return whole;
  const characters = Array.from(graphemes.segment(line), ({ segment }) => segment);
  const startOf = (kept: number) => characters.slice(0, kept).join("").trimEnd();
  // A start grows no narrower as it grows longer, so the longest that fits is found by halving.
  let longest = 0;
  let low = 1;
  let high = characters.length - 1;
  while (low <= high) {
    const kept = Math.floor((low + high) / 2);
    if (set(startOf(kept) + ELLIPSIS).width <= room) {
      longest = kept;
      low = kept + 1;
    } else {
      high = kept - 1;
    }
  }
  if (longest === 0 || drawsNothing(set(startOf(longest)))) return undefined;
  return set(startOf(longest) + ELLIPSIS);
}
