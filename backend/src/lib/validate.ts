import type { components } from "../generated/openapi.ts";
import { MAX_GROUPNAME_LEN, MAX_STS_NAME_LEN } from "./cluster/resources.ts";

export const validateAppGroup = (
  appGroup: components["schemas"]["NewApp"]["appGroup"],
) => {
  if (appGroup.type === "create-new") {
    if (
      appGroup.name.length > MAX_GROUPNAME_LEN ||
      appGroup.name.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/) === null
    ) {
      return {
        valid: false,
        message: "Invalid group name",
      };
    }
  }
  return { valid: true };
};
export const validateAppName = (name: string) => {
  if (name.length > MAX_STS_NAME_LEN || !isRFC1123(name)) {
    throw new Error(
      "App name must contain only lowercase alphanumeric characters or '-', " +
        "start and end with an alphanumeric character, " +
        `and contain at most ${MAX_STS_NAME_LEN} characters`,
    );
  }
};
