import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ConflictError, db } from "../db/index.ts";
import type { App } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { logger } from "../index.ts";
import {
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
  getRandomTag,
} from "../lib/cluster/resources.ts";
import {
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "./common/errors.ts";
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

  let { config, commitMessage } = (
    await appService.prepareMetadataForApps(organization, user, {
      type: "create",
      ...appData,
    })
  )[0];

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
      break;
    }

    case "standalone": {
      const groupName = `${appData.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
      appService.validateAppGroupName(groupName);
      appGroupId = await db.appGroup.create(appData.orgId, groupName, true);
      break;
    }

    default: {
      appData.appGroup satisfies never; // Make sure switch is exhaustive
    }
  }

  try {
    app = await db.app.create({
      orgId: appData.orgId,
      appGroupId: appGroupId,
      name: appData.name,
      clusterUsername: user.clusterUsername,
      projectId: appData.projectId,
      namespace: appData.namespace,
    });

    logger.info({ orgId: appData.orgId, appId: app.id }, "App created");

    config = deploymentConfigService.populateImageTag(config, app);
  } catch (err) {
    // In between validation and creating the app, the namespace was taken by another app
    if (err instanceof ConflictError && err.message === "namespace") {
      throw new ValidationError("Namespace is unavailable");
    }
    throw err;
  }

  try {
    await deploymentService.create({
      org: organization,
      app,
      commitMessage,
      config,
    });
  } catch (err) {
    const span = trace.getActiveSpan();
    span?.recordException(err as Error);
    span?.setStatus({ code: SpanStatusCode.ERROR });
    throw new DeploymentError(err as Error);
  }
  return app.id;
}
