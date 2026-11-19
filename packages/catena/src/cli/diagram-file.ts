import * as v from "valibot";
import {
  activeRoundButton,
  badge,
  icon,
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
  type IconContent,
  type Part,
} from "../node";
import type { Cell, Direction } from "../place";

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

export interface EdgeEntry {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Drawn at each point where this edge bends off a stretch it shares, or onto one. */
  readonly branchIcon?: IconContent;
}

export interface DiagramFile {
  readonly $schema?: string;
  readonly direction: Direction;
  readonly nodes: readonly NodeEntry[];
  readonly edges: readonly EdgeEntry[];
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

export class InvalidDiagramFileError extends Error {
  override readonly name = "InvalidDiagramFileError";
}

const DIRECTION = v.picklist(["down", "right"]);
/** A finite number: JSON such as `1e999` parses to Infinity. */
const FINITE = v.pipe(v.number(), v.finite());
const CELL = v.strictObject({ row: FINITE, column: FINITE });

function groupOf<TNode extends v.GenericSchema>(node: TNode) {
  return v.strictObject({
    id: v.string(),
    direction: DIRECTION,
    children: v.tupleWithRest([node], node),
    cell: v.optional(CELL),
  });
}

function diagramFileOf<TNode extends v.GenericSchema>(node: TNode) {
  return v.strictObject({
    $schema: v.optional(v.string()),
    direction: DIRECTION,
    nodes: v.array(node),
    edges: v.array(
      v.strictObject({
        id: v.string(),
        from: v.string(),
        to: v.string(),
        branchIcon: v.optional(icon.schema),
      }),
    ),
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
        dotRadius: v.optional(v.pipe(FINITE, v.minValue(0))),
        spacing: v.optional(v.pipe(FINITE, v.gtValue(0))),
      }),
    ),
  });
}

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

const GROUP = groupOf(NODE);

const DIAGRAM_FILE = diagramFileOf(NODE);

const NODE_WITH_CONTENT: v.GenericSchema = v.lazy(() =>
  v.union([GROUP_WITH_CONTENT, v.variant("kind", LEAVES_WITH_CONTENT)]),
);

const GROUP_WITH_CONTENT = groupOf(NODE_WITH_CONTENT);

const LEAVES_WITH_CONTENT = NODE_KIND_NAMES.map((kind) =>
  v.strictObject({
    id: v.string(),
    kind: v.literal(kind),
    content: NODE_KINDS[kind].schema,
    cell: v.optional(CELL),
  }),
);

/** The schema an editor checks a diagram file with. */
export const DIAGRAM_FILE_WITH_CONTENT = diagramFileOf(NODE_WITH_CONTENT);

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
