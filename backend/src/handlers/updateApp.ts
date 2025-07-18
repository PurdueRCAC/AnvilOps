import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { type AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { createOrUpdateApp } from "../lib/cluster/kubernetes.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { validateDeploymentConfig } from "../lib/validate.ts";
import { type HandlerMap, json } from "../types.ts";
import {
  buildAndDeploy,
  cancelAllOtherDeployments,
  generateCloneURLWithCredentials,
} from "./githubWebhook.ts";

export const updateApp: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res: ExpressResponse,
) => {
  const appData = ctx.request.requestBody;
  const appConfig = appData.config;

  {
    const result = validateDeploymentConfig({
      ...appConfig,
      appGroup: appData.appGroup,
    });
    if (!result.valid) {
      return json(400, res, { code: 400, message: result.message });
    }
  }

  const app = await db.app.findUnique({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: {
      deploymentConfigTemplate: true,
      org: { select: { githubInstallationId: true } },
    },
  });

  if (!app) {
    return json(401, res, {});
  }

  if (appConfig.source === "git") {
    if (appConfig.event === "workflow_run" && !appConfig.eventId) {
      return json(400, res, { code: 400, message: "Missing workflow id" });
    }
  }

  if (appData.appGroup.type === "add-to") {
    if (appData.appGroup.id !== app.appGroupId) {
      const originalGroupId = app.appGroupId;
      try {
        await db.app.update({
          where: { id: app.id },
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
  } else {
    const originalGroupId = app.appGroupId;
    const name =
      appData.appGroup.type === "standalone"
        ? `${appData.name}-${randomBytes(4).toString("hex")}`
        : appData.appGroup.name;
    await db.app.update({
      where: { id: app.id },
      data: {
        appGroup: {
          create: {
            name: name,
            org: { connect: { id: app.orgId } },
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

  if (appData.name) {
    await db.app.update({
      where: { id: app.id },
      data: {
        displayName: appData.name,
      },
    });
  }

  const secret = randomBytes(32).toString("hex");

  const updatedDeploymentConfig: DeploymentConfigCreateInput = {
    // Null values for unchanged sensitive vars need to be replaced with their true values
    env: withSensitiveEnv(
      app.deploymentConfigTemplate.getPlaintextEnv(),
      appConfig.env,
    ),
    fieldValues: {
      replicas: 1,
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
    appConfig.source === "git" &&
    (!app.deploymentConfigTemplate.imageTag ||
      appConfig.branch !== app.deploymentConfigTemplate.branch ||
      appConfig.repositoryId !== app.deploymentConfigTemplate.repositoryId ||
      appConfig.builder !== app.deploymentConfigTemplate.builder ||
      appConfig.dockerfilePath !==
        app.deploymentConfigTemplate.dockerfilePath ||
      appConfig.rootDir !== app.deploymentConfigTemplate.rootDir)
  ) {
    // If source is git, start a new build if the app was not successfully built in the past,
    // or if branches or repositories or any build settings were changed.
    const octokit = await getOctokit(app.org.githubInstallationId);
    const repo = await getRepoById(
      octokit,
      updatedDeploymentConfig.repositoryId!,
    );
    try {
      const latestCommit = (
        await octokit.rest.repos.listCommits({
          per_page: 1,
          owner: repo.owner.login,
          repo: repo.name,
          sha: appConfig.branch,
        })
      ).data[0];

      await buildAndDeploy({
        appId: app.id,
        orgId: app.orgId,
        imageRepo: app.imageRepo,
        commitSha: latestCommit.sha,
        commitMessage: latestCommit.commit.message, // TODO: get latest commit info
        cloneURL: await generateCloneURLWithCredentials(octokit, repo.html_url),
        config: updatedDeploymentConfig,
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
            ...updatedDeploymentConfig,
            imageTag:
              // In situations where a rebuild isn't required (given when we get to this point), we need to use the previous image tag.
              // Use the one that the user specified or the most recent successful one.
              updatedDeploymentConfig.imageTag ??
              app.deploymentConfigTemplate.imageTag,
          },
        },
        status: "DEPLOYING",
        app: { connect: { id: app.id } },
        commitHash: "Unknown",
        commitMessage: "Redeploy of previous deployment",
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
      await createOrUpdateApp(app.name, namespace, configs, postCreate);
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: "COMPLETE" },
      });
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

  // Now that the deployment succeeded, we know that the deployment config applies correctly.
  // Update the template config so that new deployments are based on this updated configuration.

  // Note: if the user is using the Git image source, the imageTag will be filled in later once the image is built.
  //       For now, we'll use the previous image tag because the new one won't be pushed if the build fails,
  //       which would make a new deployment fail if it were created from the template during this time.
  await db.deploymentConfig.update({
    where: { id: app.deploymentConfigTemplateId },
    data: {
      ...updatedDeploymentConfig,
      imageTag:
        appConfig.source === "image"
          ? updatedDeploymentConfig.imageTag
          : app.deploymentConfigTemplate.imageTag,
    },
  });

  return json(200, res, {});
};

// Patch the null(hidden) values of env vars sent from client with the sensitive plaintext
const withSensitiveEnv = (
  lastPlaintextEnv: DeploymentJson.EnvVar[],
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
