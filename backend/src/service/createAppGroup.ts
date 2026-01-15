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
  appService.validateAppGroupName(groupName);
  const apps = appData.map(
    (app) =>
      ({
        ...app,
        orgId: orgId,
      }) satisfies Omit<NewApp, "appGroup">,
  );

  const [organization, user] = await Promise.all([
    db.org.getById(orgId, { requireUser: { id: userId } }),
    db.user.getById(userId),
  ]);

  if (!organization) {
    throw new OrgNotFoundError(null);
  }

  // validate all apps before creating any
  const validationResults = await appService.prepareMetadataForApps(
    organization,
    user,
    ...appData.map((app) => ({
      type: "create" as const,
      ...app,
    })),
  );

  const appsWithMetadata = apps.map((app, idx) => ({
    appData: app,
    metadata: validationResults[idx],
  }));

  const groupId = await db.appGroup.create(orgId, groupName, false);
  // let groupId: number;
  // try {
  //   groupId = await db.appGroup.create(orgId, groupName, false);
  // } catch (e) {
  //   if (e instanceof ConflictError) {
  //     throw new ValidationError(
  //       "An app group already exists with the same name.",
  //     );
  //   }
  //   throw e;
  // }

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
      if (err instanceof ConflictError && err.message === "namespace") {
        throw new ValidationError("Namespace is unavailable");
      }

      throw err;
    }

    await deploymentService.create({
      org: organization,
      app,
      commitMessage,
      config,
    });
  }
}
