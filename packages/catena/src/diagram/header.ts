import { iconGrid, iconPathData, iconStroke } from "../icon";
import { element, shadowFilter, type SvgElement, type TextLook, type Theme } from "../node";
import { layoutText, textPathData, type TextLayout } from "../text";

/** The repository a diagram was drawn from, as its header names it. */
export interface HeaderRepository {
  readonly name: string;
}

/**
 * A band across the top of a diagram: `title` at its left; at its right `repository`, then a clock and
 * `capturedAt`, written as given. Each text is set in `fonts` on one line, a line break drawn as a space;
 * a text left out or holding only spaces is not drawn.
 *
 * When they don't all fit, the capture time keeps its whole width first, then the repository, then the
 * title, each from what the one before left. A text wider than its room is cut to the longest start that
 * fits with `…` after it, and left out when not even one character and `…` fit; the clock goes with its
 * time.
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
  /** Between the title, the repository and the clock, next to each other. */
  itemGap: 40,
} as const;

/** How far a header pushes the layout down. */
export const HEADER_HEIGHT = LOOK.height;

/** The id of the header's shadow filter. A node's ids end in a count, so none is this one. */
const SHADOW_ID = "catena-header-shadow";

const ELLIPSIS = "…";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The header across a document `width` wide, flush with its top, its bottom corners round. */
export function drawHeader(width: number, header: DiagramHeader): SvgElement[] {
  const { height, paddingX, clock, iconGap, itemGap } = LOOK;
  const middle = (size: number) => (height - size) / 2;
  const text = (set: TextLayout, x: number, look: TextLook) =>
    element("path", { d: textPathData(set, x, middle(set.height)), fill: look.color });

  const drawn = [...band(width)];
  let end = width - paddingX;
  const time = fitted(
    header.capturedAt,
    LOOK.detail,
    header,
    end - paddingX - clock.size - iconGap,
  );
  if (time !== undefined) {
    const x = end - time.width;
    const iconX = x - iconGap - clock.size;
    drawn.push(clockIcon(iconX, middle(clock.size)), text(time, x, LOOK.detail));
    end = iconX - itemGap;
  }
  const repository = fitted(header.repository?.name, LOOK.detail, header, end - paddingX);
  if (repository !== undefined) {
    const x = end - repository.width;
    drawn.push(text(repository, x, LOOK.detail));
    end = x - itemGap;
  }
  const title = fitted(header.title, LOOK.title, header, end - paddingX);
  if (title !== undefined) drawn.push(text(title, paddingX, LOOK.title));
  return drawn;
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
    shadowFilter({ x: 0, y: 0, width, height }, LOOK.shadow, SHADOW_ID),
    element("path", {
      d,
      fill: LOOK.fill,
      stroke: LOOK.stroke,
      "stroke-width": strokeWidth,
      filter: `url(#${SHADOW_ID})`,
    }),
  ];
}

function clockIcon(x: number, y: number): SvgElement {
  const { size, strokeWidth, color } = LOOK.clock;
  const scale = size / iconGrid;
  return element("path", {
    d: iconPathData.clock,
    transform: `translate(${x} ${y}) scale(${scale})`,
    ...iconStroke,
    stroke: color,
    "stroke-width": strokeWidth / scale,
  });
}

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
  if (whole.width <= room) return whole;
  const characters = Array.from(graphemes.segment(line), ({ segment }) => segment);
  for (let kept = characters.length - 1; kept >= 1; kept--) {
    const cut = set(characters.slice(0, kept).join("").trimEnd() + ELLIPSIS);
    if (cut.width <= room) return cut;
  }
  return undefined;
}
