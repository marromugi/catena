import * as v from "valibot";
import {
  activeRoundButton,
  badge,
  iconTile,
  iconTitleBodyCard,
  iconTitleCard,
  iconTitleCardPair,
  imageTitleBodyCard,
  itemCard,
  redBadge,
  roundButton,
  selectedIconTile,
  statusTitleCard,
  titleBadgeCard,
  titleBodyBadgeCard,
  titleBodyCard,
  titleBodyItemsSectionCard,
  type Part,
} from "../node";
import type { Cell, Direction } from "../place";

/** The names of the node kinds a diagram file can name: those catena exports each kind under. */
export const NODE_KIND_NAMES = [
  "activeRoundButton",
  "badge",
  "iconTile",
  "iconTitleBodyCard",
  "iconTitleCard",
  "iconTitleCardPair",
  "imageTitleBodyCard",
  "itemCard",
  "redBadge",
  "roundButton",
  "selectedIconTile",
  "statusTitleCard",
  "titleBadgeCard",
  "titleBodyBadgeCard",
  "titleBodyCard",
  "titleBodyItemsSectionCard",
] as const;

export type NodeKind = (typeof NODE_KIND_NAMES)[number];

/** Each node kind a diagram file can name, by its name. */
export const NODE_KINDS: Readonly<Record<NodeKind, Part>> = {
  activeRoundButton,
  badge,
  iconTile,
  iconTitleBodyCard,
  iconTitleCard,
  iconTitleCardPair,
  imageTitleBodyCard,
  itemCard,
  redBadge,
  roundButton,
  selectedIconTile,
  statusTitleCard,
  titleBadgeCard,
  titleBodyBadgeCard,
  titleBodyCard,
  titleBodyItemsSectionCard,
};

/** A node of one kind, its content as yet unchecked: the kind checks it. */
export interface LeafEntry {
  readonly id: string;
  readonly kind: NodeKind;
  readonly content: unknown;
  readonly cell?: Cell;
}

export interface GroupEntry {
  readonly id: string;
  readonly direction: Direction;
  readonly children: readonly [NodeEntry, ...NodeEntry[]];
  readonly cell?: Cell;
}

export type NodeEntry = LeafEntry | GroupEntry;

/** A diagram as its file gives it: the graph, each node naming its kind, and how the diagram is drawn. */
export interface DiagramFile {
  readonly direction: Direction;
  readonly nodes: readonly NodeEntry[];
  readonly edges: readonly { readonly id: string; readonly from: string; readonly to: string }[];
  readonly header?: {
    readonly title?: string;
    readonly repository?: { readonly name: string };
    readonly capturedAt?: string;
  };
  readonly background?: {
    readonly canvas?: string;
    readonly dot?: string;
    readonly dotRadius?: number;
    readonly spacing?: number;
  };
}

/** The text given as a diagram file is not JSON, or not a diagram. */
export class InvalidDiagramFileError extends Error {
  override readonly name = "InvalidDiagramFileError";
}

const DIRECTION = v.picklist(["down", "right"]);
const CELL = v.strictObject({ row: v.number(), column: v.number() });

const LEAF = v.strictObject({
  id: v.string(),
  kind: v.picklist(NODE_KIND_NAMES),
  content: v.unknown(),
  cell: v.optional(CELL),
});

const isGroup = (input: unknown) =>
  typeof input === "object" && input !== null && "children" in input;

const NODE: v.GenericSchema<unknown, NodeEntry> = v.lazy((input) =>
  isGroup(input) ? GROUP : LEAF,
);

const GROUP = v.strictObject({
  id: v.string(),
  direction: DIRECTION,
  children: v.tupleWithRest([NODE], NODE),
  cell: v.optional(CELL),
});

const DIAGRAM_FILE = v.strictObject({
  direction: DIRECTION,
  nodes: v.array(NODE),
  edges: v.array(v.strictObject({ id: v.string(), from: v.string(), to: v.string() })),
  header: v.optional(
    v.strictObject({
      title: v.optional(v.string()),
      repository: v.optional(v.strictObject({ name: v.string() })),
      capturedAt: v.optional(v.string()),
    }),
  ),
  background: v.optional(
    v.strictObject({
      canvas: v.optional(v.string()),
      dot: v.optional(v.string()),
      dotRadius: v.optional(v.pipe(v.number(), v.minValue(0))),
      spacing: v.optional(v.pipe(v.number(), v.gtValue(0))),
    }),
  ),
});

/**
 * The diagram `text` holds as JSON. A node's content is checked by its kind when the node is built, not here.
 * @throws InvalidDiagramFileError when `text` is not JSON, or not a diagram, naming where.
 */
export function readDiagramFile(text: string): DiagramFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new InvalidDiagramFileError(`The file is not JSON: ${String(cause)}`, { cause });
  }
  const parsed = v.safeParse(DIAGRAM_FILE, json);
  if (!parsed.success) {
    throw new InvalidDiagramFileError(`The file is not a diagram: ${v.summarize(parsed.issues)}`, {
      cause: new v.ValiError(parsed.issues),
    });
  }
  return parsed.output;
}
