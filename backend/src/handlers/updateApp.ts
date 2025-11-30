import { randomBytes } from "node:crypto";
import { db, NotFoundError } from "../db/index.ts";
import type { DeploymentConfigCreate } from "../db/models.ts";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { canManageProject } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { validateAppGroup, validateDeploymentConfig } from "../lib/validate.ts";
import { type HandlerMap, json } from "../types.ts";
import {
  buildAndDeploy,
  cancelAllOtherDeployments,
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

  try {
    await validateDeploymentConfig(appData.config);
    if (appData.appGroup) {
      validateAppGroup(appData.appGroup);
    }
  } catch (e) {
    return json(400, res, {
      code: 400,
      message: e.message,
    });
  }

  if (appData.projectId) {
    const user = await db.user.getById(req.user.id);
    if (!(await canManageProject(user.clusterUsername, appData.projectId))) {
      return json(404, res, { code: 404, message: "Project not found" });
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
    env: withSensitiveEnv(currentConfig.getEnv(), appConfig.env),
    collectLogs: appConfig.collectLogs,
    replicas: appConfig.replicas,
    port: appConfig.port,
    mounts: appConfig.mounts,
    requests: appConfig.requests,
    limits: appConfig.limits,
    ...(appConfig.source === "git"
      ? {
          source: "GIT",
          branch: appConfig.branch,
          repositoryId: appConfig.repositoryId,
          commitHash: appConfig.commitHash ?? currentConfig.commitHash,
          builder: appConfig.builder,
          rootDir: appConfig.rootDir,
          dockerfilePath: appConfig.dockerfilePath,
          event: appConfig.event,
          eventId: appConfig.eventId,
        }
      : {
          source: "IMAGE",
          imageTag: appConfig.imageTag,
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
    const octokit = await getOctokit(org.githubInstallationId);
    const repo = await getRepoById(octokit, updatedConfig.repositoryId);
    try {
      const latestCommit = (
        await octokit.rest.repos.listCommits({
          per_page: 1,
          owner: repo.owner.login,
          repo: repo.name,
          sha: updatedConfig.branch,
        })
      ).data[0];

      await buildAndDeploy({
        app: originalApp,
        org: org,
        imageRepo: originalApp.imageRepo,
        commitMessage: latestCommit.commit.message,
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
