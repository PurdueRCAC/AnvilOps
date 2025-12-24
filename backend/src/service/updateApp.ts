import { randomBytes } from "node:crypto";
import { db, NotFoundError } from "../db/index.ts";
import type { DeploymentConfigCreate } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { canManageProject } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { validateAppGroup, validateDeploymentConfig } from "../lib/validate.ts";
import {
  buildAndDeploy,
  cancelAllOtherDeployments,
  log,
} from "../service/githubWebhook.ts";
import {
  AppNotFoundError,
  DeploymentError,
  ValidationError,
} from "./common/errors.ts";

export type AppUpdate = components["schemas"]["AppUpdate"];

export async function updateApp(
  appId: number,
  userId: number,
  appData: AppUpdate,
) {
  // ---------------- Input validation ----------------

  const originalApp = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (!originalApp) {
    throw new AppNotFoundError();
  }

  try {
    await validateDeploymentConfig(appData.config);
    if (appData.appGroup) {
      validateAppGroup(appData.appGroup);
    }
  } catch (e) {
    throw new ValidationError(e.message, { cause: e });
  }

  if (appData.projectId) {
    const user = await db.user.getById(userId);
    if (!(await canManageProject(user.clusterUsername, appData.projectId))) {
      throw new ValidationError("Project not found");
    }
  }

  // ---------------- App group updates ----------------

  if (appData.appGroup?.type === "add-to") {
    // Add the app to an existing group
    if (appData.appGroup.id !== originalApp.appGroupId) {
      try {
        await db.app.setGroup(originalApp.id, appData.appGroup.id);
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ValidationError("App group not found");
        }
      }
    }
  } else if (appData.appGroup) {
    // Create a new group
    const name =
      appData.appGroup.type === "standalone"
        ? `${appData.name}-${randomBytes(4).toString("hex")}`
        : appData.appGroup.name;

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

  const updatedConfig: DeploymentConfigCreate = {
    // Null values for unchanged sensitive vars need to be replaced with their true values
    env: withSensitiveEnv(currentConfig.getEnv(), appData.config.env),
    createIngress: appData.config.createIngress,
    subdomain: appData.config.subdomain,
    collectLogs: appData.config.collectLogs,
    replicas: appData.config.replicas,
    port: appData.config.port,
    mounts: appData.config.mounts,
    requests: appData.config.requests,
    limits: appData.config.limits,
    ...(appData.config.source === "git"
      ? {
          source: "GIT",
          branch: appData.config.branch,
          repositoryId: appData.config.repositoryId,
          commitHash: appData.config.commitHash ?? currentConfig.commitHash,
          builder: appData.config.builder,
          rootDir: appData.config.rootDir,
          dockerfilePath: appData.config.dockerfilePath,
          event: appData.config.event,
          eventId: appData.config.eventId,
        }
      : {
          source: "IMAGE",
          imageTag: appData.config.imageTag,
        }),
  };

  // ---------------- Rebuild if necessary ----------------

  if (
    updatedConfig.source === "GIT" &&
    (!currentConfig.imageTag ||
      currentDeployment.status === "ERROR" ||
      updatedConfig.branch !== currentConfig.branch ||
      updatedConfig.repositoryId !== currentConfig.repositoryId ||
      updatedConfig.builder !== currentConfig.builder ||
      (updatedConfig.builder === "dockerfile" &&
        updatedConfig.dockerfilePath !== currentConfig.dockerfilePath) ||
      updatedConfig.rootDir !== currentConfig.rootDir ||
      updatedConfig.commitHash !== currentConfig.commitHash)
  ) {
    // If source is git, start a new build if the app was not successfully built in the past,
    // or if branches or repositories or any build settings were changed.
    const gitProvider = await getGitProvider(org.id);
    try {
      const latestCommit = await gitProvider.getLatestCommit(
        updatedConfig.repositoryId,
        updatedConfig.branch,
      );

      await buildAndDeploy({
        app: originalApp,
        org: org,
        imageRepo: originalApp.imageRepo,
        commitMessage: latestCommit.message,
        config: updatedConfig,
        createCheckRun: false,
      });

      // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
    } catch (err) {
      throw new DeploymentError(err);
    }
  } else {
    // ---------------- Redeploy the app with the new configuration ----------------
    const deployment = await db.deployment.create({
      config: {
        ...updatedConfig,
        imageTag:
          // In situations where a rebuild isn't required (given when we get to this point), we need to use the previous image tag.
          // Use the one that the user specified or the most recent successful one.
          updatedConfig.imageTag ?? currentConfig.imageTag,
      },
      status: "DEPLOYING",
      appId: originalApp.id,
      commitMessage: currentDeployment.commitMessage,
    });

    const config = await db.deployment.getConfig(deployment.id);

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
        userId,
        app.projectId,
        ["KubernetesObjectApi"],
      );
      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);

      await Promise.all([
        cancelAllOtherDeployments(org, app, deployment.id, true),
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
