import { ConflictError, db } from "../db/index.ts";
import type { App } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { OrgNotFoundError, ValidationError } from "../service/common/errors.ts";
import { type NewApp } from "../service/createApp.ts";
import {
  appService,
  deploymentConfigService,
  deploymentService,
} from "./helper/index.ts";

export type NewAppWithoutGroup =
  components["schemas"]["NewAppWithoutGroupInfo"];

export async function createAppGroup(
  userId: number,
  orgId: number,
  groupName: string,
  appData: NewAppWithoutGroup[],
) {
  // validate all apps before creating any
  appService.validateAppGroupName(groupName);
  const groupId = await db.appGroup.create(orgId, groupName, false);

  const appsWithGroups = appData.map(
    (app) =>
      ({
        ...app,
        orgId: orgId,
        appGroup: { type: "add-to", id: groupId },
      }) satisfies NewApp,
  );

  const [organization, user] = await Promise.all([
    db.org.getById(orgId, { requireUser: { id: userId } }),
    db.user.getById(userId),
  ]);

  if (!organization) {
    throw new OrgNotFoundError(null);
  }

  const validationResults = await appService.prepareMetadataForApps(
    organization,
    user,
    ...appData,
  );

  const appsWithMetadata = appsWithGroups.map((app, idx) => ({
    appData: app,
    metadata: validationResults[idx],
  }));

  for (const { appData, metadata } of appsWithMetadata) {
    let { config, commitMessage } = metadata;
    let app: App;
    try {
      app = await db.app.create({
        orgId: appData.orgId,
        appGroupId: groupId,
        name: appData.name,
        clusterUsername: user.clusterUsername,
        projectId: appData.projectId,
        namespace: appData.namespace,
      });
      config = deploymentConfigService.populateImageTag(config, app);
    } catch (err) {
      // In between validation and creating the app, the namespace was taken by another app
      if (err instanceof ConflictError) {
        throw new ValidationError(err.message + " is unavailable");
      }
    }

    await deploymentService.create({
      org: organization,
      app,
      commitMessage,
      config,
    });
  }
}
