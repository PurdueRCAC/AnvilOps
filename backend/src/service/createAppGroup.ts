import { ConflictError, db } from "../db/index.ts";
import type { components } from "../generated/openapi.ts";
import { validateAppGroup } from "../lib/validate.ts";
import { AppCreateError, ValidationError } from "../service/common/errors.ts";
import {
  createApp,
  validateAppConfig,
  type NewApp,
} from "../service/createApp.ts";

export type NewAppWithoutGroup =
  components["schemas"]["NewAppWithoutGroupInfo"];

export async function createAppGroup(
  userId: number,
  orgId: number,
  groupName: string,
  appData: NewAppWithoutGroup[],
) {
  const validationResult = validateAppGroup({
    type: "create-new",
    name: groupName,
  });
  if (!validationResult.valid) {
    throw new ValidationError(validationResult.message);
  }

  let groupId: number;
  try {
    groupId = await db.appGroup.create(orgId, groupName, false);
  } catch (e) {
    if (e instanceof ConflictError) {
      throw new ValidationError(
        "An app group already exists with the same name.",
      );
    }
    throw e;
  }

  const appsWithGroups = appData.map(
    (app) =>
      ({
        ...app,
        appGroup: { type: "add-to", id: groupId },
      }) satisfies NewApp,
  );

  const validationResults = await Promise.all(
    appsWithGroups.map(async (app) => {
      try {
        return await validateAppConfig(userId, app);
      } catch (e) {
        throw new AppCreateError(app.name, e);
      }
    }),
  );

  for (let i = 0; i < appsWithGroups.length; i++) {
    try {
      await createApp(appsWithGroups[i], validationResults[i]);
    } catch (e) {
      throw new AppCreateError(appsWithGroups[i].name, e);
    }
  }
}
