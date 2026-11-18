import { toJsonSchema, type JsonSchema } from "@valibot/to-json-schema";
import { iconNames } from "../icon";
import { ICON_NAME, REGISTERED_LOGO } from "../node";
import { DIAGRAM_FILE_WITH_CONTENT } from "./diagram-file";

/**
 * It leaves out a logo named on the theme (`{ "logo": "<name>" }`): `catena draw` registers none, so it
 * draws none.
 *
 * JSON Schema can't say a number is finite, so it takes a number such as `1e999` that `catena draw`
 * refuses as Infinity.
 */
export function diagramJsonSchema(customIconNames: readonly string[]): JsonSchema {
  return toJsonSchema(DIAGRAM_FILE_WITH_CONTENT, {
    target: "draft-07",
    ignoreActions: ["finite"],
    overrideSchema: ({ valibotSchema, jsonSchema }) => {
      if (valibotSchema === ICON_NAME) {
        return { type: "string", enum: [...iconNames, ...customIconNames] };
      }
      const options: readonly unknown[] =
        valibotSchema.type === "union" &&
        "options" in valibotSchema &&
        Array.isArray(valibotSchema.options)
          ? valibotSchema.options
          : [];
      if (options.includes(REGISTERED_LOGO)) {
        const anyOf = jsonSchema.anyOf?.filter((_, index) => options[index] !== REGISTERED_LOGO);
        return { ...jsonSchema, anyOf };
      }
      // Content a part takes only when it is absent, such as a divider's: the key is left out.
      if (valibotSchema.type === "undefined") return { not: {} };
      return undefined;
    },
  });
}
