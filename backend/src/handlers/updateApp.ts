import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import {
  createOrUpdateApp,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { validateAppGroup, validateDeploymentConfig } from "../lib/validate.ts";
import { type HandlerMap, json } from "../types.ts";
import { buildAndDeploy, cancelAllOtherDeployments } from "./githubWebhook.ts";
import { type AuthenticatedRequest } from "./index.ts";
import { canManageProject } from "../lib/cluster/rancher.ts";

export const updateApp: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res: ExpressResponse,
) => {
  const appData = ctx.request.requestBody;
  const appConfig = appData.config;

  const originalApp = await db.app.findUnique({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: {
      config: true,
      org: { select: { githubInstallationId: true } },
      appGroup: true,
    },
  });

  if (!originalApp) {
    return json(401, res, {});
  }

  const validation = validateDeploymentConfig(appData.config);
  if (!validation.valid) {
    return json(400, res, { code: 400, message: validation.message });
  }
  if (appData.appGroup) {
    const appGroupValidation = validateAppGroup(appData.appGroup);

    if (!appGroupValidation.valid) {
      return json(400, res, {
        code: 400,
        message: appGroupValidation.message,
      });
    }
  }

  if (appData.projectId) {
    const { clusterUsername } = await db.user.findUnique({
      where: { id: req.user.id },
    });
    if (!(await canManageProject(clusterUsername, appData.projectId))) {
      return json(401, res, {});
    }
  }

  if (appData.appGroup?.type === "add-to") {
    if (appData.appGroup.id !== originalApp.appGroupId) {
      const originalGroupId = originalApp.appGroupId;
      try {
        await db.app.update({
          where: { id: originalApp.id },
          data: {
            appGroup: {
              connect: { id: appData.appGroup.id },
            },
          },
        });
        const remainingApps = await db.app.count({
          where: { appGroupId: originalGroupId },
        });
        if (remainingApps === 0)
          await db.appGroup.delete({ where: { id: originalGroupId } });
      } catch (err) {
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === "P2025"
        ) {
          // https://www.prisma.io/docs/orm/reference/error-reference#p2025
          // "An operation failed because it depends on one or more records that were required but not found. {cause}"
          return json(500, res, { code: 500, message: "App group not found" });
        }
      }
    }
  } else if (appData.appGroup) {
    const originalGroupId = originalApp.appGroupId;
    const name =
      appData.appGroup.type === "standalone"
        ? `${appData.name}-${randomBytes(4).toString("hex")}`
        : appData.appGroup.name;
    await db.app.update({
      where: { id: originalApp.id },
      data: {
        appGroup: {
          create: {
            name: name,
            org: { connect: { id: originalApp.orgId } },
            isMono: appData.appGroup.type === "standalone",
          },
        },
      },
    });

    const remainingApps = await db.app.count({
      where: { appGroupId: originalGroupId },
    });
    if (remainingApps === 0) {
      await db.appGroup.delete({ where: { id: originalGroupId } });
    }
  }

  const data = {} as Record<string, any>;
  if (appData.name !== undefined) {
    data.displayName = appData.name;
  }

  if (appData.projectId !== undefined) {
    data.projectId = appData.projectId;
  }

  if (appData.enableCD !== undefined) {
    data.enableCD = appData.enableCD;
  }

  if (Object.keys(data).length > 0) {
    await db.app.update({ where: { id: originalApp.id }, data });
  }

  await db.app.update({
    where: { id: originalApp.id },
    data: {
      ...(appData.projectId &&
        appData.projectId !== originalApp.projectId && {
          projectId: appData.projectId,
        }),
    },
  });

  const secret = randomBytes(32).toString("hex");

  const currentConfig = originalApp.config;
  const updatedConfig: DeploymentConfigCreateInput = {
    // Null values for unchanged sensitive vars need to be replaced with their true values
    env: withSensitiveEnv(currentConfig.getPlaintextEnv(), appConfig.env),
    fieldValues: {
      replicas: appConfig.replicas,
      port: appConfig.port,
      servicePort: 80,
      mounts: appConfig.mounts,
      extra: {
        postStart: appConfig.postStart,
        preStop: appConfig.preStop,
      },
    },
    ...(appConfig.source === "git"
      ? {
          source: "GIT",
          branch: appConfig.branch,
          repositoryId: appConfig.repositoryId,
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

  if (
    updatedConfig.source === "GIT" &&
    (!currentConfig.imageTag ||
      updatedConfig.branch !== currentConfig.branch ||
      updatedConfig.repositoryId !== currentConfig.repositoryId ||
      updatedConfig.builder !== currentConfig.builder ||
      updatedConfig.dockerfilePath !== currentConfig.dockerfilePath ||
      updatedConfig.rootDir !== currentConfig.rootDir)
  ) {
    // If source is git, start a new build if the app was not successfully built in the past,
    // or if branches or repositories or any build settings were changed.
    const octokit = await getOctokit(originalApp.org.githubInstallationId);
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
        appId: originalApp.id,
        orgId: originalApp.orgId,
        imageRepo: originalApp.imageRepo,
        commitSha: latestCommit.sha,
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
    // Create a new deployment from the template
    const deployment = await db.deployment.create({
      data: {
        config: {
          create: {
            ...updatedConfig,
            imageTag:
              // In situations where a rebuild isn't required (given when we get to this point), we need to use the previous image tag.
              // Use the one that the user specified or the most recent successful one.
              updatedConfig.imageTag ?? currentConfig.imageTag,
          },
        },
        status: "DEPLOYING",
        app: { connect: { id: originalApp.id } },
        commitMessage: "Update to deployment configuration",
        secret,
      },
      select: {
        id: true,
        appId: true,
        app: {
          include: {
            appGroup: true,
            org: { select: { githubInstallationId: true } },
          },
        },
        config: true,
      },
    });

    await cancelAllOtherDeployments(deployment.id, deployment.app, true);

    try {
      const { namespace, configs, postCreate } =
        createAppConfigsFromDeployment(deployment);

      const { KubernetesObjectApi: api } = await getClientsForRequest(
        req.user.id,
        deployment.app.projectId,
        ["KubernetesObjectApi"],
      );
      await createOrUpdateApp(
        api,
        originalApp.name,
        namespace,
        configs,
        postCreate,
      );

      await Promise.all([
        db.deployment.update({
          where: { id: deployment.id },
          data: { status: "COMPLETE" },
        }),
        db.app.update({
          where: { id: ctx.request.params.appId },
          data: { config: { connect: { id: deployment.config.id } } },
        }),
      ]);
    } catch (err) {
      console.error(err);
      await db.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "ERROR",
        },
      });
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
