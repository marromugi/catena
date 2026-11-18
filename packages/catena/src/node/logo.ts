import * as v from "valibot";

const FINITE = v.pipe(v.number(), v.finite());
const BREADTH = v.pipe(v.number(), v.finite(), v.gtValue(0));
export const VIEW_BOX = v.strictObject({ x: FINITE, y: FINITE, width: BREADTH, height: BREADTH });
const COLOR = v.pipe(v.string(), v.nonEmpty());

/**
 * One shape of a logo, in its own colour: filled, by SVG's nonzero rule or, with `fillRule` `evenodd`,
 * by its even-odd rule; or stroked `width` across in its view box's units with the built-in icons' round
 * caps and joins.
 */
const LOGO_SHAPE = v.variant("paint", [
  v.strictObject({
    pathData: v.string(),
    paint: v.literal("fill"),
    color: COLOR,
    fillRule: v.optional(v.literal("evenodd")),
  }),
  v.strictObject({
    pathData: v.string(),
    paint: v.literal("stroke"),
    color: COLOR,
    width: BREADTH,
  }),
]);
export type LogoShape = v.InferOutput<typeof LOGO_SHAPE>;

/**
 * Shapes drawn in order, each in its own colour.
 */
const OWN_LOGO = v.strictObject({
  viewBox: VIEW_BOX,
  shapes: v.pipe(v.array(LOGO_SHAPE), v.nonEmpty()),
});
export type OwnLogo = v.InferOutput<typeof OWN_LOGO>;

/**
 * Written into the SVG as given: catena never fetches it.
 */
const OWN_IMAGE = v.strictObject({ href: v.string() });
export type OwnImage = v.InferOutput<typeof OWN_IMAGE>;

/**
 * A user's own icon: path data in the area `viewBox` names, as an SVG `viewBox` does, either stroked as
 * the built-in icons are or filled, in the look's colour.
 */
export const OWN_ICON = v.strictObject({
  pathData: v.string(),
  viewBox: VIEW_BOX,
  paint: v.picklist(["stroke", "fill"]),
});
export type OwnIcon = v.InferOutput<typeof OWN_ICON>;

export const CUSTOM_ICON = v.union([OWN_ICON, OWN_LOGO, OWN_IMAGE]);
export type CustomIcon = v.InferOutput<typeof CUSTOM_ICON>;

export const REGISTRABLE_LOGO = v.union([OWN_LOGO, OWN_IMAGE]);
export type RegistrableLogo = v.InferOutput<typeof REGISTRABLE_LOGO>;

export const REGISTERED_LOGO = v.strictObject({ logo: v.string() });
export type RegisteredLogo = v.InferOutput<typeof REGISTERED_LOGO>;

export class UnknownLogoError extends Error {
  override readonly name = "UnknownLogoError";

  constructor(readonly logo: string) {
    super(`The theme holds no logo named "${logo}".`);
  }
}

export class UnknownIconError extends Error {
  override readonly name = "UnknownIconError";

  constructor(readonly icon: string) {
    super(`No icon is named "${icon}": neither a built-in icon nor a custom one.`);
  }
}
