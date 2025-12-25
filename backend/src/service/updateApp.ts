import { db } from "../db/index.ts";
import {
  Deployment,
  HelmConfig,
  HelmConfigCreate,
  WorkloadConfig,
  WorkloadConfigCreate,
} from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import {
  createAppConfigsFromDeployment,
  getRandomTag,
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
} from "../lib/cluster/resources.ts";
import {
  buildAndDeploy,
  cancelAllOtherDeployments,
  deployFromHelm,
  log,
} from "../service/githubWebhook.ts";
import {
  AppNotFoundError,
  DeploymentError,
  ValidationError,
} from "./common/errors.ts";
import { appService } from "./helper/index.ts";

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
    this.orgRepo.getById(originalApp.orgId, { requireUser: { id: userId } }),
    this.userRepo.getById(userId),
  ]);

  // performs validation
  const { config: updatedConfig, commitMessage } = (
    await appService.prepareMetadataForApps(organization, user, appData)
  )[0];

  // ---------------- App group updates ----------------
  switch (appData.appGroup.type) {
    case "add-to": {
      const group = await db.appGroup.getById(appData.appGroup.id);
      if (!group) {
        throw new ValidationError("Invalid app group");
      }
      db.app.setGroup(originalApp.id, appData.appGroup.id);
      break;
    }

    case "create-new": {
      appService.validateAppGroupName(appData.appGroup.name);
      const appGroupId = await db.appGroup.create(
        originalApp.orgId,
        appData.appGroup.name,
        false,
      );
      db.app.setGroup(originalApp.id, appGroupId);
      break;
    }

    case "standalone": {
      // In this case, group name is constructed from the app name
      // App name was previously validated. If it passed RFC1123, then
      // a substring plus random tag will also pass, so no re-validation
      let groupName = `${appData.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
      const appGroupId = await db.appGroup.create(
        originalApp.orgId,
        groupName,
        true,
      );
      db.app.setGroup(originalApp.id, appGroupId);
      break;
    }
  }

  // ---------------- App model updates ----------------

  const updates = {} as Record<string, any>;
  if (appData.name !== undefined) {
    updates.displayName = appData.name;
  }

  if (appData.projectId !== undefined) {
    updates.projectId = appData.projectId;
  }

  if (appData.enableCD !== undefined) {
    updates.enableCD = appData.enableCD;
  }

  if (Object.keys(updates).length > 0) {
    await db.app.update(originalApp.id, updates);
  }

  const app = await db.app.getById(originalApp.id);
  const [appGroup, currentConfig, currentDeployment] = await Promise.all([
    db.appGroup.getById(app.appGroupId),
    db.app.getDeploymentConfig(app.id),
    db.app.getCurrentDeployment(app.id),
  ]);
  // ---------------- Rebuild if necessary ----------------

  if (shouldBuildOnUpdate(currentConfig, updatedConfig, currentDeployment)) {
    // If source is git, start a new build if the app was not successfully built in the past,
    // or if branches or repositories or any build settings were changed.
    try {
      await buildAndDeploy({
        app,
        org: organization,
        imageRepo: app.imageRepo,
        commitMessage,
        config: updatedConfig,
        createCheckRun: false,
      });
      // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
    } catch (err) {
      throw new DeploymentError(err);
    }
  } else if (updatedConfig.appType === "helm") {
    const deployment = await db.deployment.create({
      appId: app.id,
      commitMessage,
      appType: "helm",
      config: updatedConfig,
    });
    await cancelAllOtherDeployments(organization, app, deployment.id, true);
    await deployFromHelm(app, deployment, updatedConfig);
  } else {
    // ---------------- Redeploy the app with the new configuration ----------------
    // To reach this block, the update must be:
    // (1) from a Git deployment to a similar Git deployment, in which case the current imageTag is reused
    // (2) from any deployment type to an image deployment, in which case the updatedConfig will have an imageTag

    const deployment = await db.deployment.create({
      status: "DEPLOYING",
      appType: "workload",
      appId: originalApp.id,
      commitMessage,
      config: {
        ...updatedConfig,
        imageTag:
          // In situations where a rebuild isn't required (given when we get to this point), we need to use the previous image tag.
          // Use the one that the user specified or the most recent successful one.
          updatedConfig.imageTag ?? (currentConfig as WorkloadConfig).imageTag,
      },
    });

    const config = (await db.deployment.getConfig(
      deployment.id,
    )) as WorkloadConfig;

    try {
      const { namespace, configs, postCreate } =
        await createAppConfigsFromDeployment(
          organization,
          originalApp,
          appGroup,
          deployment,
          config,
        );

      const { KubernetesObjectApi: api } = await getClientsForRequest(
        userId,
        app.projectId,
        ["KubernetesObjectApi"],
      );
      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);

      await Promise.all([
        cancelAllOtherDeployments(organization, app, deployment.id, true),
        db.deployment.setStatus(deployment.id, "COMPLETE"),
        db.app.setConfig(appId, deployment.configId),
      ]);
    } catch (err) {
      console.error(
        `Failed to update Kubernetes resources for deployment ${deployment.id}`,
        err,
      );
      await db.deployment.setStatus(deployment.id, "ERROR");
      await log(
        deployment.id,
        "BUILD",
        `Failed to update Kubernetes resources: ${JSON.stringify(err?.body ?? err)}`,
        "stderr",
      );
    }
  }
}

const shouldBuildOnUpdate = (
  oldConfig: WorkloadConfig | HelmConfig,
  newConfig: WorkloadConfigCreate | HelmConfigCreate,
  currentDeployment: Deployment,
) => {
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
};

// Patch the null(hidden) values of env vars sent from client with the sensitive plaintext
export const withSensitiveEnv = (
  lastPlaintextEnv: PrismaJson.EnvVar[],
  envVars: {
    name: string;
    value: string | null;
    isSensitive: boolean;
  }[],
) => {
  const lastEnvMap =
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
};
