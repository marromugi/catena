---
name: catena-diagrams
description: What makes a catena diagram easy to read, checked on the drawn SVG, and what the diagram file can change to get there. Use when writing or editing a catena diagram file (the JSON that `catena draw` reads), when checking an SVG that `catena draw` drew, or when a catena diagram looks messy or tangled — lines leaving nodes from the top or bottom, lines looping wide around nodes, many lines bunched together, lines crossing, or a drawing far wider than it is tall.
---

# Catena diagrams

Write the diagram file, draw it, look at the drawing, and change the file until every rule below holds or only a known limit breaks it.

`catena` is on the PATH after `pnpm link --global` in `packages/catena` of a catena checkout. Without that, run `node packages/catena/bin/catena.js` from the checkout, after `pnpm install`:

```sh
catena draw <diagram.json> -o <out.svg>
catena schema
```

`catena schema` writes the diagram file's JSON Schema, `diagram.schema.json`, into catena's config directory and prints the `"$schema": "<path>"` line to put at the top of the diagram file. This skill uses only what that schema allows: `direction`, the order of `nodes`, groups (a node with `direction` and `children`), `cell`, and `edges`.

Judge the drawing, not the JSON. Open the SVG in a browser or render it to PNG and look at it whole.

## How catena places nodes and lines

The rules rest on these.

- `direction` is the flow. In `right`, the flow goes from column to column, left to right; in `down`, from row to row, top to bottom.
- A node goes one column (in `down`, one row) past the furthest node **listed before it** that has an edge to it. An edge from a node listed later orders nothing. Nodes that land in the same column stack across the flow in the order they are listed, each taking the first free row.
- `cell` (`{ "row": 0, "column": 2 }`) puts a node in that row and column of its own grid. Rows and columns that hold no node are dropped.
- A line leaves a node from the side that faces along the flow and enters a node from the side that faces back: in `right`, out of the right side and into the left side. Lines that leave one node run as one until they part.
- A line between two nodes of one grid in neighbouring columns is straight, or has two bends when the rows differ. A line goes around, through the gaps beside the nodes, when it skips a column, goes back, or would cross another line between the same two columns.
- A group lays its children out in a grid of their own, flowing in the group's `direction`. The grid of the group is one node in the grid around it: an edge to any child counts as an edge to the group when nodes are ordered.
- A group is not drawn: no box, no background, no label.
- Every line into or out of a group crosses the group's border at one point: where its one child (or one chain of children along the flow) lines up, such as a captioned tile's square, or else at or near the middle of the side. The group lines up with the nodes beside it there. The part outside the group and the part inside are each drawn as a line of their own grid and joined there.
- Each row is as tall as the tallest node in it, and each column as wide as the widest, a group counting as one node.

### Counting bends

Every bend is drawn as a rounded corner. A line that hasn't gone around has:

- 0 bends when it is straight, and 2 when it goes to another row of the next column;
- up to 2 more for each group border it crosses, from its part inside the group, so a line from a node into a group in the next column can have 4;
- 3 when it enters or leaves a child of a group that flows across its parent (rule 1).

More bends than that mean the line went around.

## Rules

Each rule says what to look for in the drawing, then what the file can do.

### 1. Lines leave and enter along the flow

**Look for:** in `right`, every line leaves the right side of a node and enters the left side of the next; in `down`, bottom to top. A line that touches a node's top or bottom in `right` (left or right side in `down`) breaks this.

**The file:** a group whose `direction` differs from the grid around it draws its children's lines through the other pair of sides, and lays out children that have no line between them along the parent's flow, which makes the drawing longer. Give every group the same `direction` as the grid around it. Children with no edge between them then stack across the flow, which is usually what was wanted. A chain that should run across the flow inside a group is a trade between this rule and rule 3: keep the group's `direction` and put each next node of the chain in the next row with `cell`, and its line leaves and enters along the flow but goes around. Whether that reads better than lines through the top and bottom is for the drawing to show (known limit, #106).

### 2. Lines go forward

**Look for:** no line runs back against the flow or loops around a node to come back to an earlier column. A drawing where every node sits in one long column (in `right`) and lines loop around it has this everywhere.

**The file:** list nodes in the order the flow reads, so every edge goes from a node listed earlier to one listed later. The same holds for the children of each group. Where the graph has a real cycle, one line has to go back; keep its two ends close in the list.

### 3. Lines join neighbouring columns

**Look for:** a line with more bends than [Counting bends](#counting-bends) allows, or a line that runs past a node to reach one further along.

**The file:** a line that went around comes from one of these:

- An edge that skips a node, such as `a>c` beside `a>b` and `b>c`. Leave out an edge that a path through other nodes already says, when the diagram's point holds without it. A node that many nodes far apart lead to, such as a shared store, lands after the last of them and pulls long lines from the rest; keep only the edges that matter for what the diagram explains.
- A line that would cross another between the same two columns: see rule 4.
- An edge back against the flow: see rule 2.
- A node put with `cell`: a column before a node that leads to it makes that line go back, and a row under a node of the same column makes the line between them go around.

### 4. Lines don't cross or swap rows

**Look for:** two lines that cross, or two lines between the same two columns that swap rows and so run beside each other, one of them going around.

**The file:** list the nodes that land in one column in the same order as the nodes that lead to them. If `a` comes before `b`, and `a>y`, `b>x`, list `y` before `x`. `cell` can set the rows directly.

### 5. Lines don't bunch in one place

**Look for:** more than about three lines running side by side through one gap, or several lines meeting at one point where no node is.

**The file:** lines meet at one point where they enter or leave a group (known limit, #107). Group only nodes whose lines come from one place and go to one place, such as two clients that one user reaches and that both call one gateway. Leave a node that many other nodes lead to out of groups. Lines that skip columns (rule 3) share the gaps between rows, so cutting those cuts the bunching too.

### 6. Groups make the drawing better or go

**Look for:** draw the diagram with and without the group. Keep the group only when the drawing with it has fewer bends, crossings, and bunched lines. Nodes stacked in one column (in `right`) with a wide gap between them, and long lines across it, mean a tall group shares a row with one of them.

**The file:** a group changes only where its children sit, since nothing marks it in the drawing (known limit, #108). Prefer no group, then one level; nest deeper only when the drawing shows it helps. Keep a group's children few, so its row stays short, or move other nodes off its row with `cell`.

### 7. The drawing keeps a readable shape

**Look for:** the SVG's `width` and `height`. A drawing more than about three times wider than tall (or taller than wide) shrinks to unreadable when it is fitted to a page or a screen.

**The file:** in `right`, each column adds a node's width; more than about five columns makes a long strip. Use `down` for a long chain, or split the diagram into two files at a column that few lines cross. Nodes with no edge between them in one column make the drawing taller, not longer.

## Known limits

catena breaks these whatever the file says. Say so when a drawing shows one, rather than reworking the file to hide it.

- **A group that flows across its parent** draws its lines through the top and bottom (in `right`): a line into it runs over the first child and drops into its top, a line out of it leaves the last child's bottom and comes back around. Giving the group its parent's `direction` avoids it, but then a chain across the flow inside the group needs `cell` and goes around (rule 1). #106
- **Lines into or out of a group meet at one point** on the group's side (rule above), and run on top of each other there, so a reader can't follow which line goes to which child. Only not grouping avoids it. #107
- **A group is not drawn.** A reader sees only the gaps between nodes; which nodes belong together can't be read from the drawing. #108

## Example

The files in `examples/` hold one diagram four ways: a user, two clients, a gateway, auth, orders, billing, a queue and worker, and three stores, with the same 14 edges. Drawn by catena as of this skill:

- `groups-crosswise.json`, in `right`: the clients, the gateway and auth, the services, and the stores each in a group, the queue and worker in a group inside the services, the groups in `down` and `right` by turns. 4032 × 317, 66 bends. Lines leave nodes from the top and bottom, loop under whole groups, cross, and meet at the stores' group in one point.
- `groups-along.json`: the same with every group in `right`. 2976 × 400, 44 bends. Lines still meet where they enter the stores' group and the services' group.
- `two-groups.json`, in `right`: only the two clients and the queue with its worker grouped, everything else plain nodes. 2528 × 522, 26 bends. Lines still cross near the stores (`auth>db` and `orders>db` cross `worker>files`), and the drawing is still a strip (rule 7).
- `two-groups-down.json`: the same in `down`, its groups in `down` too. 1440 × 922, 26 bends, the same crossings.

The kept groups are the two clients, which one user reaches and which both call the gateway, and the queue and worker, which only orders reaches.

## Checking a drawing

1. Draw the file and look at the SVG whole.
2. Go through rules 1 to 7, and for each one that fails, change the file as it says and draw again.
3. Stop when every rule holds or each one that fails is a known limit, and name those limits to whoever asked for the diagram.
