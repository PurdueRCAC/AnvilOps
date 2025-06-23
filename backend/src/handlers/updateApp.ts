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

  if (
    appConfig.source === "git" &&
    (appConfig.branch !== app.deploymentConfigTemplate.branch ||
      appConfig.repositoryId !== app.deploymentConfigTemplate.repositoryId)
  ) {
    // When changing branches or repositories, start a new build
    const octokit = await getOctokit(app.org.githubInstallationId);
    const repo = await getRepoById(
      octokit,
      appConfig.repositoryId ?? app.deploymentConfigTemplate.repositoryId,
    );
    try {
      await buildAndDeploy({
        appId: app.id,
        orgId: app.orgId,
        imageRepo: app.imageRepo,
        commitSha: lastDeployment?.commitHash ?? "Unknown",
        commitMessage: `Redeploy of ${lastDeployment?.commitHash?.slice(0, 8) ?? "previous deployment"}`,
        cloneURL: await generateCloneURLWithCredentials(octokit, repo.html_url),
        config: {
          repositoryId:
            appConfig.repositoryId ?? app.deploymentConfigTemplate.repositoryId,
          branch: appConfig.branch ?? app.deploymentConfigTemplate.branch,
          port: appData.config.port,
          env: appData.config.env,
          secrets: appData.config.secrets
            ? JSON.stringify(appData.config.secrets)
            : undefined,
          builder: appData.config.builder,
          dockerfilePath: appData.config.dockerfilePath,
          rootDir: appData.config.rootDir,
          mounts: { createMany: { data: appData.config.mounts } },
          source: convertSource(appData.config.source),
          imageTag: appData.config.imageTag,
          replicas: app.deploymentConfigTemplate.replicas,
        },
        createCheckRun: false,
      });
    } catch (err) {
      console.error(err);
      return json(500, res, {
        code: 500,
        message: "Failed to create a deployment for your app.",
      });
    }

    return json(200, res, {});
  }

  const secret = randomBytes(32).toString("hex");

  const updatedDeploymentConfig: DeploymentConfigCreateInput & {
    mounts: MountConfigCreateNestedManyWithoutDeploymentConfigInput;
  } = {
    branch: appData.config.branch,
    repositoryId: appData.config.repositoryId,
    source: convertSource(appData.config.source),
    imageTag: appData.config.imageTag,
    builder: appData.config.builder,
    port: appData.config.port,
    rootDir: appData.config.rootDir,
    dockerfilePath: appData.config.dockerfilePath,
    env: appData.config.env,
    replicas: appData.config.replicas,
    secrets: JSON.stringify(appData.config.secrets),
    mounts: { createMany: { data: appData.config.mounts } },
  };

  // Update the "template" used to create new deployments without user intervention
  await db.deploymentConfig.update({
    where: { id: app.deploymentConfigTemplateId },
    data: updatedDeploymentConfig,
  });

  // Create a new deployment from the template
  const deployment = await db.deployment.create({
    data: {
      config: {
        create: updatedDeploymentConfig,
      },
      status: "DEPLOYING",
      app: { connect: { id: app.id } },
      imageTag: app.deploymentConfigTemplate.imageTag,
      commitHash: lastDeployment?.commitHash ?? "Unknown",
      commitMessage: `Redeploy of ${lastDeployment ? `#${lastDeployment?.id}` : "previous deployment"}`,
      secret,
    },
    select: {
      id: true,
      appId: true,
      imageTag: true,
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
  }

  return json(200, res, {});
};

export default updateApp;
