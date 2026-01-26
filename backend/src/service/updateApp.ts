import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db } from "../db/index.ts";
import type {
  Deployment,
  DeploymentConfig,
  HelmConfigCreate,
  WorkloadConfigCreate,
} from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { logger } from "../index.ts";
import {
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
  getRandomTag,
} from "../lib/cluster/resources.ts";
import {
  AppNotFoundError,
  DeploymentError,
  ValidationError,
} from "./common/errors.ts";
import {
  appService,
  deploymentConfigService,
  deploymentService,
} from "./helper/index.ts";

export type AppUpdate = components["schemas"]["AppUpdate"];

export async function updateApp(
  appId: number,
  userId: number,
  appData: AppUpdate,
) {
  const originalApp = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (!originalApp) {
    throw new AppNotFoundError();
  }

  const [organization, user] = await Promise.all([
    db.org.getById(originalApp.orgId, { requireUser: { id: userId } }),
    db.user.getById(userId),
  ]);

  // performs validation
  const { config: _config, commitMessage } = (
    await appService.prepareMetadataForApps(organization, user, {
      type: "update",
      existingAppId: originalApp.id,
      ...appData,
    })
  )[0];
  let updatedConfig = _config;

  // ---------------- App group updates ----------------
  let appGroupId: number;
  switch (appData.appGroup?.type) {
    case "add-to": {
      if (appData.appGroup.id === originalApp.appGroupId) {
        break;
      }
      appGroupId = appData.appGroup.id;
      const group = await db.appGroup.getById(appGroupId);
      if (!group) {
        throw new ValidationError("Invalid app group");
      }
      await db.app.setGroup(originalApp.id, appGroupId);
      break;
    }

    case "create-new": {
      appService.validateAppGroupName(appData.appGroup.name);
      appGroupId = await db.appGroup.create(
        originalApp.orgId,
        appData.appGroup.name,
        false,
      );
      await db.app.setGroup(originalApp.id, appGroupId);
      break;
    }

    case "standalone": {
      if (appData.appGroup.type === "standalone") {
        break;
      }
      const groupName = `${originalApp.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
      appService.validateAppGroupName(groupName);
      appGroupId = await db.appGroup.create(originalApp.orgId, groupName, true);
      await db.app.setGroup(originalApp.id, appGroupId);
      break;
    }

    default: {
      throw new ValidationError("Unexpected app group action type");
    }
  }

  if (appData.appGroup) {
    logger.info(
      { orgId: organization.id, appId: originalApp.id, appGroupId: appGroupId },
      "App group updated",
    );
  }

  // ---------------- App model updates ----------------

  const updates = {} as Record<string, string | boolean>;
  if (appData.displayName !== undefined) {
    updates.displayName = appData.displayName;
  }

  if (appData.projectId !== undefined) {
    updates.projectId = appData.projectId;
  }

  if (appData.enableCD !== undefined) {
    updates.enableCD = appData.enableCD;
  }

  if (Object.keys(updates).length > 0) {
    await db.app.update(originalApp.id, updates);
    logger.info(
      { orgId: organization.id, appId: originalApp.id, updates },
      "App updated",
    );
  }

  const app = await db.app.getById(originalApp.id);
  const [currentConfig, currentDeployment] = await Promise.all([
    db.app.getDeploymentConfig(app.id),
    db.app.getCurrentDeployment(app.id),
  ]);

  // Adds an image tag to Git configs
  updatedConfig = deploymentConfigService.populateImageTag(updatedConfig, app);

  if (
    updatedConfig.appType === "workload" &&
    currentConfig.appType === "workload"
  ) {
    updatedConfig.env = withSensitiveEnv(
      currentConfig.getEnv(),
      updatedConfig.env,
    );
  }

  try {
    await deploymentService.create({
      org: organization,
      app,
      commitMessage,
      config: updatedConfig,
      git: {
        skipBuild: !shouldBuildOnUpdate(
          currentConfig,
          updatedConfig,
          currentDeployment,
        ),
      },
    });
    // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
  } catch (err) {
    const span = trace.getActiveSpan();
    span?.recordException(err as Error);
    span?.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Failed to update app",
    });

    throw new DeploymentError(err as Error);
  }
  logger.info({ orgId: organization.id, appId: app.id }, "App updated");
}

function shouldBuildOnUpdate(
  oldConfig: DeploymentConfig,
  newConfig: WorkloadConfigCreate | HelmConfigCreate,
  currentDeployment: Deployment,
) {
  // Only Git apps need to be built
  if (newConfig.source !== "GIT") {
    return false;
  }

  // Either this app has not been built in the past, or it has not been built successfully
  if (
    oldConfig.source !== "GIT" ||
    !oldConfig.imageTag ||
    currentDeployment.status === "ERROR"
  ) {
    return true;
  }

  // The code has changed
  if (
    newConfig.branch !== oldConfig.branch ||
    newConfig.repositoryId != oldConfig.repositoryId ||
    newConfig.commitHash != oldConfig.commitHash
  ) {
    return true;
  }

  // Build options have changed
  if (
    newConfig.builder != oldConfig.builder ||
    newConfig.rootDir != oldConfig.rootDir ||
    (newConfig.builder === "dockerfile" &&
      newConfig.dockerfilePath != oldConfig.dockerfilePath)
  ) {
    return true;
  }

  return false;
}

// Patch the null(hidden) values of env vars sent from client with the sensitive plaintext
function withSensitiveEnv(
  lastPlaintextEnv: PrismaJson.EnvVar[],
  envVars: {
    name: string;
    value: string | null;
    isSensitive: boolean;
  }[],
) {
  const lastEnvMap: Record<string, string> =
    lastPlaintextEnv?.reduce((map, env) => {
      return Object.assign(map, { [env.name]: env.value });
    }, {}) ?? {};
  return envVars.map((env) =>
    env.value === null
      ? {
          name: env.name,
          value: lastEnvMap[env.name],
          isSensitive: env.isSensitive,
        }
      : env,
  );
}
