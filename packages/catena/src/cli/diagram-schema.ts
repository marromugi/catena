import { toJsonSchema, type JsonSchema } from "@valibot/to-json-schema";
import { iconNames } from "../icon";
import { ICON_NAME } from "../node";
import { DIAGRAM_FILE_WITH_CONTENT } from "./diagram-file";

/**
 * The JSON Schema (draft-07) of the diagram file, made from the schemas `catena draw` checks it with.
 * Wherever an icon's content is a bare string it lists the built-in icons' names, then `customIconNames`.
 */
export function diagramJsonSchema(customIconNames: readonly string[]): JsonSchema {
  return toJsonSchema(DIAGRAM_FILE_WITH_CONTENT, {
    target: "draft-07",
    // JSON holds no number that isn't finite.
    ignoreActions: ["finite"],
    overrideSchema: ({ valibotSchema }) => {
      if (valibotSchema === ICON_NAME) {
        return { type: "string", enum: [...iconNames, ...customIconNames] };
      }
      // Content a part takes only when it is absent, such as a divider's: the key is left out.
      if (valibotSchema.type === "undefined") return { not: {} };
      return undefined;
    },
  });
}
