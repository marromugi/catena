/** An SVG `matrix(a b c d e f)`: a point (x, y) goes to (a·x + c·y + e, b·x + d·y + f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `outer` applied after `inner`, as SVG composes a parent's transform with its child's. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

export const isIdentity = (matrix: Matrix): boolean =>
  matrix.every((value, i) => value === IDENTITY[i]);

/** 0 when the matrix flattens what it draws to a line or a point. */
export const determinant = ([a, b, c, d]: Matrix): number => a * d - b * c;

/**
 * How much the matrix scales every length by, when it scales evenly in all directions (turning or
 * mirroring as it may); `undefined` when lengths in different directions scale differently.
 */
export function evenScale(matrix: Matrix): number | undefined {
  const [a, b, c, d] = matrix;
  const across = a * a + b * b;
  const down = c * c + d * d;
  const tolerance = 1e-9 * Math.max(across, down);
  if (Math.abs(across - down) > tolerance || Math.abs(a * c + b * d) > tolerance) return undefined;
  return Math.sqrt(Math.abs(determinant(matrix)));
}

const TRANSFORM = /\s*(,\s*)?(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/y;

/**
 * The matrix an SVG `transform` attribute gives, read as SVG writes the list; `undefined` when it is not
 * such a list.
 */
export function transformList(given: string): Matrix | undefined {
  const text = given.trim();
  let matrix = IDENTITY;
  for (let at = 0; at < text.length; at = TRANSFORM.lastIndex) {
    TRANSFORM.lastIndex = at;
    const found = TRANSFORM.exec(text);
    if (found === null || (at === 0 && found[1] !== undefined)) return undefined;
    const numbers = argumentList(found[3] ?? "");
    const one = numbers === undefined ? undefined : transformFunction(found[2] ?? "", numbers);
    if (one === undefined) return undefined;
    matrix = multiply(matrix, one);
  }
  return matrix;
}

/** A transform function's numbers, apart by space or one comma, as SVG writes them. */
function argumentList(given: string): number[] | undefined {
  const numbers: number[] = [];
  let at = 0;
  for (;;) {
    const pattern = numbers.length === 0 ? FIRST_NUMBER : NEXT_NUMBER;
    pattern.lastIndex = at;
    const found = pattern.exec(given)?.[1];
    if (found === undefined) break;
    const value = number(found);
    if (value === undefined) return undefined;
    numbers.push(value);
    at = pattern.lastIndex;
  }
  return given.slice(at).trim() === "" ? numbers : undefined;
}

function transformFunction(name: string, numbers: readonly number[]): Matrix | undefined {
  const [first = 0, second, third, fourth = 0, fifth = 0, sixth = 0] = numbers;
  const count = numbers.length;
  switch (name) {
    case "matrix":
      return count === 6 ? [first, second ?? 0, third ?? 0, fourth, fifth, sixth] : undefined;
    case "translate":
      return count === 1 || count === 2 ? translation(first, second ?? 0) : undefined;
    case "scale":
      return count === 1 || count === 2 ? [first, 0, 0, second ?? first, 0, 0] : undefined;
    case "rotate": {
      if (count !== 1 && count !== 3) return undefined;
      const [cos, sin] = turn(first);
      const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
      const x = second ?? 0;
      const y = third ?? 0;
      return multiply(multiply(translation(x, y), rotation), translation(-x, -y));
    }
    case "skewX":
      return count === 1 ? [1, 0, slope(first), 1, 0, 0] : undefined;
    case "skewY":
      return count === 1 ? [1, slope(first), 0, 1, 0, 0] : undefined;
    default:
      return undefined;
  }
}

/** Cosine and sine of an angle in degrees, exact at quarter turns. */
function turn(degrees: number): [number, number] {
  const quarter = (((degrees % 360) + 360) % 360) / 90;
  if (quarter === 0) return [1, 0];
  if (quarter === 1) return [0, 1];
  if (quarter === 2) return [-1, 0];
  if (quarter === 3) return [0, -1];
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

/** Tangent of an angle in degrees, exact at eighth turns that have one. */
function slope(degrees: number): number {
  const eighth = (((degrees % 180) + 180) % 180) / 45;
  if (eighth === 0) return 0;
  if (eighth === 1) return 1;
  if (eighth === 3) return -1;
  return Math.tan((degrees * Math.PI) / 180);
}

/** Arguments each path command takes, a group of them repeated as often as the data gives. */
const ARGUMENTS: ReadonlyMap<string, number> = new Map([
  ["M", 2],
  ["L", 2],
  ["H", 1],
  ["V", 1],
  ["C", 6],
  ["S", 4],
  ["Q", 4],
  ["T", 2],
  ["A", 7],
  ["Z", 0],
]);

const COMMAND = /\s*([MLHVCSQTAZ])/iy;
const NUMBER_TEXT = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
/** A command's or a transform function's first number. */
const FIRST_NUMBER = new RegExp(String.raw`\s*(${NUMBER_TEXT})`, "y");
/** Any later number, apart from the one before by space, one comma, or nothing where it can start. */
const NEXT_NUMBER = new RegExp(String.raw`\s*,?\s*(${NUMBER_TEXT})`, "y");
const NEXT_FLAG = /\s*,?\s*([01])/y;

/**
 * SVG path data with `matrix` applied, in absolute commands, so it draws where the original drew under
 * the matrix; `undefined` when `pathData` is not path data. `H` and `V` become `L`, an arc with a zero
 * radius becomes the line it draws, and an arc's radii, turn and sweep follow the matrix.
 */
export function transformPathData(pathData: string, matrix: Matrix): string | undefined {
  const text = pathData.trim();
  const written: string[] = [];
  const point = (x: number, y: number): string => {
    const [a, b, c, d, e, f] = matrix;
    return `${a * x + c * y + e} ${b * x + d * y + f}`;
  };
  let at = 0;
  const read = (pattern: RegExp): string | undefined => {
    pattern.lastIndex = at;
    const found = pattern.exec(text)?.[1];
    if (found !== undefined) at = pattern.lastIndex;
    return found;
  };
  const numberFollows = (): boolean => {
    NEXT_NUMBER.lastIndex = at;
    return NEXT_NUMBER.test(text);
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  while (at < text.length) {
    const letter = read(COMMAND);
    if (letter === undefined) return undefined;
    let command = letter.toUpperCase();
    if (written.length === 0 && command !== "M") return undefined;
    const relative = letter !== command;
    const count = ARGUMENTS.get(command) ?? 0;
    if (count === 0) {
      written.push("Z");
      x = startX;
      y = startY;
      continue;
    }
    let firstGroup = true;
    do {
      const given: number[] = [];
      for (let i = 0; i < count; i += 1) {
        const flag = command === "A" && (i === 3 || i === 4);
        const pattern = flag ? NEXT_FLAG : firstGroup && i === 0 ? FIRST_NUMBER : NEXT_NUMBER;
        const found = read(pattern);
        // A number past the largest one stays Infinity, for the caller to refuse as overflow.
        if (found === undefined) return undefined;
        given.push(Number(found));
      }
      firstGroup = false;
      const [first = 0] = given;
      if (command === "H") given.splice(0, 1, relative ? x + first : first, y);
      else if (command === "V") given.splice(0, 1, x, relative ? y + first : first);
      else if (relative) {
        const from = command === "A" ? 5 : 0;
        for (let i = from; i < given.length; i += 2) {
          given[i] = (given[i] ?? 0) + x;
          given[i + 1] = (given[i + 1] ?? 0) + y;
        }
      }
      const endX = given.at(-2) ?? 0;
      const endY = given.at(-1) ?? 0;
      if (command === "A") written.push(arc(matrix, given, point(endX, endY)));
      else {
        const pairs: string[] = [];
        for (let i = 0; i < given.length; i += 2)
          pairs.push(point(given[i] ?? 0, given[i + 1] ?? 0));
        const drawn = command === "H" || command === "V" ? "L" : command;
        written.push(`${drawn} ${pairs.join(" ")}`);
      }
      x = endX;
      y = endY;
      if (command === "M") {
        startX = endX;
        startY = endY;
        command = "L";
      }
    } while (numberFollows());
  }
  return written.join(" ");
}

/**
 * An arc `rx ry turn large sweep x y` under the matrix: the ellipse it runs along mapped by the matrix,
 * whose radii are the singular values of the matrix times the ellipse's own axes, and whose sweep turns
 * the other way when the matrix mirrors.
 */
function arc(matrix: Matrix, given: readonly number[], end: string): string {
  const [givenX = 0, givenY = 0, degrees = 0, large = 0, sweep = 0] = given;
  const rx = Math.abs(givenX);
  const ry = Math.abs(givenY);
  if (rx === 0 || ry === 0) return `L ${end}`;
  const [a, b, c, d] = matrix;
  const [cos, sin] = turn(degrees);
  // The 2×2 matrix [[p, q], [r, s]] takes the unit circle to the arc's ellipse after the matrix.
  const p = (a * cos + c * sin) * rx;
  const q = (c * cos - a * sin) * ry;
  const r = (b * cos + d * sin) * rx;
  const s = (d * cos - b * sin) * ry;
  const even = Math.hypot((p + s) / 2, (r - q) / 2);
  const odd = Math.hypot((p - s) / 2, (r + q) / 2);
  const axis = (Math.atan2((r + q) / 2, (p - s) / 2) + Math.atan2((r - q) / 2, (p + s) / 2)) / 2;
  const mirrored = determinant(matrix) < 0;
  const turned = (axis * 180) / Math.PI;
  return `A ${even + odd} ${Math.abs(even - odd)} ${turned} ${large} ${mirrored ? 1 - sweep : sweep} ${end}`;
}

/** Numbers apart by space, a comma, or nothing where the next sign or point starts one, as SVG lists them. */
const LISTED_NUMBER = new RegExp(String.raw`[\s,]*(${NUMBER_TEXT})`, "y");

export function numberList(given: string): number[] | undefined {
  const text = given.trim();
  const numbers: number[] = [];
  for (let at = 0; at < text.length; at = LISTED_NUMBER.lastIndex) {
    LISTED_NUMBER.lastIndex = at;
    const found = LISTED_NUMBER.exec(text)?.[1];
    const value = found === undefined ? undefined : number(found);
    if (value === undefined) return undefined;
    numbers.push(value);
  }
  return numbers;
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** A number as SVG writes one, `undefined` when it is not one or runs past the largest number. */
export function number(given: string): number | undefined {
  if (!NUMBER.test(given)) return undefined;
  const found = Number(given);
  return Number.isFinite(found) ? found : undefined;
}
