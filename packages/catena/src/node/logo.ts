import * as v from "valibot";

const FINITE = v.pipe(v.number(), v.finite());
const BREADTH = v.pipe(v.number(), v.finite(), v.gtValue(0));
export const VIEW_BOX = v.strictObject({ x: FINITE, y: FINITE, width: BREADTH, height: BREADTH });
const COLOR = v.pipe(v.string(), v.nonEmpty());

/**
 * One shape of a logo, in its own colour: filled, or stroked `width` across in its view box's units with
 * the built-in icons' round caps and joins.
 */
const LOGO_SHAPE = v.variant("paint", [
  v.strictObject({ pathData: v.string(), paint: v.literal("fill"), color: COLOR }),
  v.strictObject({
    pathData: v.string(),
    paint: v.literal("stroke"),
    color: COLOR,
    width: BREADTH,
  }),
]);
export type LogoShape = v.InferOutput<typeof LOGO_SHAPE>;

/**
 * A user's own logo: shapes in the area `viewBox` names, drawn in order, each in its own colour.
 * The logo is the caller's to use, following that brand's own guidelines.
 */
const OWN_LOGO = v.strictObject({
  viewBox: VIEW_BOX,
  shapes: v.pipe(v.array(LOGO_SHAPE), v.nonEmpty()),
});
export type OwnLogo = v.InferOutput<typeof OWN_LOGO>;

/**
 * A user's own image, by its href, written into the SVG as given: catena never fetches it.
 * The image is the caller's to use, following that brand's own guidelines when it is a logo.
 */
const OWN_IMAGE = v.strictObject({ href: v.string() });
export type OwnImage = v.InferOutput<typeof OWN_IMAGE>;

/** What can be registered on a theme by name: a user's own logo or image. */
export const REGISTRABLE_LOGO = v.union([OWN_LOGO, OWN_IMAGE]);
export type RegistrableLogo = v.InferOutput<typeof REGISTRABLE_LOGO>;

/** The name of a logo registered on the theme, as an icon's content gives it. */
export const REGISTERED_LOGO = v.strictObject({ logo: v.string() });
export type RegisteredLogo = v.InferOutput<typeof REGISTERED_LOGO>;

/** An icon's content names a logo the theme does not hold. */
export class UnknownLogoError extends Error {
  override readonly name = "UnknownLogoError";

  constructor(readonly logo: string) {
    super(`The theme holds no logo named "${logo}".`);
  }
}
