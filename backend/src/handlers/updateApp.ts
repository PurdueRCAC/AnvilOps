import { randomBytes } from "node:crypto";
import { db, NotFoundError } from "../db/index.ts";
import {
  Deployment,
  HelmConfig,
  HelmConfigCreate,
  WorkloadConfig,
  WorkloadConfigCreate,
} from "../db/models.ts";
import {
  appValidator,
  deploymentConfigValidator,
  deploymentService,
} from "../domain/index.ts";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { type HandlerMap, json } from "../types.ts";
import {
  buildAndDeploy,
  cancelAllOtherDeployments,
  deployFromHelm,
  log,
} from "./githubWebhook.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const updateApp: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;
  const appConfig = appData.config;

  // ---------------- Input validation ----------------

  const originalApp = await db.app.getById(ctx.request.params.appId, {
    requireUser: { id: req.user.id },
  });

  if (!originalApp) {
    return json(404, res, { code: 404, message: "App not found" });
  }

  const organization = await db.org.getById(originalApp.orgId);
  const user = await db.user.getById(req.user.id);
  let metadata: Awaited<
    ReturnType<typeof deploymentService.prepareDeploymentMetadata>
  >;
  try {
    if (appData.config.appType === "workload") {
      await deploymentConfigValidator.validateCommonWorkloadConfig(
        appData.config,
      );
    }
    await appValidator.validateApps(organization, user, appData);
    metadata = await deploymentService.prepareDeploymentMetadata(
      appData.config,
      organization.id,
    );
  } catch (e) {
    return json(400, res, {
      code: 400,
      message: e.message,
    });
  }

  // ---------------- App group updates ----------------

  if (appData.appGroup?.type === "add-to") {
    // Add the app to an existing group
    if (appData.appGroup.id !== originalApp.appGroupId) {
      try {
        await db.app.setGroup(originalApp.id, appData.appGroup.id);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return json(404, res, { code: 404, message: "App group not found" });
        }
      }
    }
  } else if (appData.appGroup) {
    // Create a new group
    const name =
      appData.appGroup.type === "standalone"
        ? `${appData.name}-${randomBytes(4).toString("hex")}`
        : appData.appGroup.name;
    try {
      appValidator.validateAppGroupName(name);
    } catch (e) {
      return json(400, res, { code: 400, message: e.message });
    }

    const newGroupId = await db.appGroup.create(
      originalApp.orgId,
      name,
      appData.appGroup.type === "standalone",
    );

    await db.app.setGroup(originalApp.id, newGroupId);
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

  // ---------------- Create updated deployment configuration ----------------

  const app = await db.app.getById(originalApp.id);
  const [appGroup, org, currentConfig, currentDeployment] = await Promise.all([
    db.appGroup.getById(app.appGroupId),
    db.org.getById(app.orgId),
    db.app.getDeploymentConfig(app.id),
    db.app.getCurrentDeployment(app.id),
  ]);

  const { config: updatedConfig, commitMessage } = metadata;

  // ---------------- Rebuild if necessary ----------------

  if (shouldBuildOnUpdate(currentConfig, updatedConfig, currentDeployment)) {
    // If source is git, start a new build if the app was not successfully built in the past,
    // or if branches or repositories or any build settings were changed.
    try {
      await buildAndDeploy({
        app: originalApp,
        org: org,
        imageRepo: originalApp.imageRepo,
        commitMessage,
        config: updatedConfig,
        createCheckRun: false,
      });

      // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
    } catch (err) {
      console.error(err);
      return json(500, res, {
        code: 500,
        message: "Failed to create a deployment for your app.",
      });
    }
  } else if (updatedConfig.appType === "helm") {
    const deployment = await db.deployment.create({
      appId: app.id,
      commitMessage,
      appType: "helm",
      config: updatedConfig,
    });
    await cancelAllOtherDeployments(org, app, deployment.id, true);
    await deployFromHelm(app, deployment, updatedConfig);
    return json(200, res, {});
  } else {
    // ---------------- Redeploy the app with the new configuration ----------------
    // To reach this block, the update must be:
    // (1) from a Git deployment to a similar Git deployment, in which case the current imageTag is reused
    // (2) from any deployment type to an image deployment, in which case the updatedConfig will have an imageTag
    const deployment = await db.deployment.create({
      config: {
        ...updatedConfig,
        imageTag:
          // In situations where a rebuild isn't required (given when we get to this point), we need to use the previous image tag.
          // Use the one that the user specified or the most recent successful one.
          updatedConfig.imageTag ?? (currentConfig as WorkloadConfig).imageTag,
      },
      status: "DEPLOYING",
      appType: "workload",
      appId: originalApp.id,
      commitMessage: currentDeployment.commitMessage,
    });

    const config = (await db.deployment.getConfig(
      deployment.id,
    )) as WorkloadConfig;

    try {
      const { namespace, configs, postCreate } =
        await createAppConfigsFromDeployment(
          org,
          app,
          appGroup,
          deployment,
          config,
        );

      const { KubernetesObjectApi: api } = await getClientsForRequest(
        req.user.id,
        app.projectId,
        ["KubernetesObjectApi"],
      );
      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);

      await Promise.all([
        cancelAllOtherDeployments(org, app, deployment.id, true),
        db.deployment.setStatus(deployment.id, "COMPLETE"),
        db.app.setConfig(ctx.request.params.appId, deployment.configId),
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
      return json(200, res, {});
    }
  }
  return json(200, res, {});
};

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
