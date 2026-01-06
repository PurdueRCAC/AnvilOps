import { ConflictError, db } from "../db/index.ts";
import type { App } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import {
  getRandomTag,
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
} from "../lib/cluster/resources.ts";
import { OrgNotFoundError, ValidationError } from "./common/errors.ts";
import {
  appService,
  deploymentConfigService,
  deploymentService,
} from "./helper/index.ts";

export type NewApp = components["schemas"]["NewApp"];

export async function createApp(appData: NewApp, userId: number) {
  const [organization, user] = await Promise.all([
    db.org.getById(appData.orgId, { requireUser: { id: userId } }),
    db.user.getById(userId),
  ]);

  if (!organization) {
    throw new OrgNotFoundError(null);
  }

  let app: App;
  let appGroupId: number;

  switch (appData.appGroup.type) {
    case "add-to": {
      const group = await db.appGroup.getById(appData.appGroup.id);
      if (!group) {
        throw new ValidationError("Invalid app group");
      }
      appGroupId = appData.appGroup.id;
      break;
    }

    case "create-new": {
      appService.validateAppGroupName(appData.appGroup.name);
      appGroupId = await db.appGroup.create(
        appData.orgId,
        appData.appGroup.name,
        false,
      );
    }

    case "standalone": {
      // In this case, group name is constructed from the app name
      // App name was previously validated. If it passed RFC1123, then
      // a substring plus random tag will also pass, so no re-validation
      let groupName = `${appData.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
      appGroupId = await db.appGroup.create(appData.orgId, groupName, true);
      break;
    }
  }

  let { config, commitMessage } = (
    await appService.prepareMetadataForApps(organization, user, appData)
  )[0];

  try {
    app = await db.app.create({
      orgId: appData.orgId,
      appGroupId: appGroupId,
      name: appData.name,
      clusterUsername: user.clusterUsername,
      projectId: appData.projectId,
      namespace: appData.namespace,
    });

    config = deploymentConfigService.updateConfigWithApp(config, app);
  } catch (err) {
    // In between validation and creating the app, the namespace was taken by another app
    if (err instanceof ConflictError) {
      throw new ValidationError(err.message + " is unavailable");
    }
    throw err;
  }

  await deploymentService.create({
    org: organization,
    app,
    commitMessage,
    config,
  });
  return app.id;
}
