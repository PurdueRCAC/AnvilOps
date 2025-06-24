import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import type {
  DeploymentConfigCreateInput,
  MountConfigCreateNestedManyWithoutDeploymentConfigInput,
} from "../generated/prisma/models.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import {
  createAppConfigsFromDeployment,
  createOrUpdateApp,
} from "../lib/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { validateDeploymentConfig } from "../lib/validate.ts";
import { type HandlerMap, json } from "../types.ts";
import { convertSource } from "./createApp.ts";
import {
  buildAndDeploy,
  generateCloneURLWithCredentials,
} from "./githubWebhook.ts";

const updateApp: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res: ExpressResponse,
) => {
  const appData = ctx.request.requestBody;
  const appConfig = appData.config;

  {
    const result = validateDeploymentConfig(appConfig);
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
      deployments: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        include: { config: true },
      },
      deploymentConfigTemplate: true,
      org: { select: { githubInstallationId: true } },
    },
  });

  if (!app) {
    return json(401, res, {});
  }

  if (!app.deployments) {
    return json(400, res, {});
  }

  if (appData.name) {
    await db.app.update({
      where: { id: app.id },
      data: {
        displayName: appData.name ?? app.displayName,
      },
    });
  }

  const lastDeployment = app.deployments[0];

  if (lastDeployment && lastDeployment.status != "ERROR") {
    await db.deployment.update({
      where: { id: lastDeployment.id },
      data: { status: "STOPPED" },
    });
  }

  const secret = randomBytes(32).toString("hex");

  const updatedDeploymentConfig: DeploymentConfigCreateInput & {
    mounts: MountConfigCreateNestedManyWithoutDeploymentConfigInput;
  } = {
    source: convertSource(appConfig.source),
    ...(appConfig.source === "git"
      ? {
          branch: appConfig.branch,
          repositoryId: appConfig.repositoryId,
          builder: appConfig.builder,
          rootDir: appConfig.rootDir,
          dockerfilePath: appConfig.dockerfilePath,
        }
      : {
          // If we're not using the Git image source, clear these fields from the config
          branch: null,
          repositoryId: null,
          builder: null,
          rootDir: null,
          dockerfilePath: null,
        }),

    ...(appConfig.source === "image"
      ? {
          imageTag: appConfig.imageTag,
        }
      : {
          // If we're not using the OCI image source, clear the imageTag field. It will be populated later when the image is built.
          imageTag: null,
        }),

    port: appConfig.port,
    env: appConfig.env,
    replicas: appConfig.replicas,
    secrets: JSON.stringify(appConfig.secrets),
    mounts: { createMany: { data: appConfig.mounts } },
  };

  if (
    appConfig.source === "git" &&
    (appConfig.branch !== app.deploymentConfigTemplate.branch ||
      appConfig.repositoryId !== app.deploymentConfigTemplate.repositoryId)
  ) {
    // When changing branches or repositories, start a new build
    const octokit = await getOctokit(app.org.githubInstallationId);
    const repo = await getRepoById(
      octokit,
      updatedDeploymentConfig.repositoryId!,
    );
    try {
      await buildAndDeploy({
        appId: app.id,
        orgId: app.orgId,
        imageRepo: app.imageRepo,
        commitSha: lastDeployment?.commitHash ?? "Unknown",
        commitMessage: `Redeploy of ${lastDeployment?.commitHash?.slice(0, 8) ?? "previous deployment"}`,
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
          create: updatedDeploymentConfig,
        },
        status: "DEPLOYING",
        app: { connect: { id: app.id } },
        commitHash: lastDeployment?.commitHash ?? "Unknown",
        commitMessage: `Redeploy of ${lastDeployment ? `#${lastDeployment?.id}` : "previous deployment"}`,
        secret,
      },
      select: {
        id: true,
        appId: true,
        app: true,
        config: { include: { mounts: true } },
      },
    });

    try {
      const { namespace, configs } = createAppConfigsFromDeployment(deployment);
      await createOrUpdateApp(app.name, namespace, configs);
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
        updatedDeploymentConfig.imageTag ??
        app.deploymentConfigTemplate.imageTag,
      mounts: {
        // Delete all existing mounts and replace them with new ones
        deleteMany: { deploymentConfigId: app.deploymentConfigTemplateId },
        ...updatedDeploymentConfig.mounts,
      },
    },
  });

  return json(200, res, {});
};

export default updateApp;
