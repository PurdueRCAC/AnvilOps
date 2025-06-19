import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import {
  createAppConfigs,
  createOrUpdateApp,
  deleteStorage,
  NAMESPACE_PREFIX,
} from "../lib/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { type Env, type HandlerMap, json } from "../types.ts";
import { validateEnv } from "./createApp.ts";
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
  if (appConfig.rootDir.startsWith("/") || appConfig.rootDir.includes(`"`)) {
    return json(400, res, { code: 400, message: "Invalid root directory" });
  }

  if (appConfig.env?.some((it) => !it.name || it.name.length === 0)) {
    return json(400, res, {
      code: 400,
      message: "Some environment variable(s) are empty",
    });
  }

  if (appConfig.port < 0 || appConfig.port > 65535) {
    return json(400, res, {
      code: 400,
      message: "Invalid port number",
    });
  }

  if (appConfig.dockerfilePath) {
    if (
      appConfig.dockerfilePath.startsWith("/") ||
      appConfig.dockerfilePath.includes(`"`)
    ) {
      return json(400, res, { code: 400, message: "Invalid Dockerfile path" });
    }
  }

  if (appData.storage) {
    if (!appData.storage.image.includes(":")) {
      return json(400, res, {
        code: 400,
        message: "Invalid image (Must be in the foramt repository:tag)",
      });
    }

    if (appData.storage.amount <= 0 || appData.storage.amount > 10) {
      return json(400, res, {
        code: 400,
        message:
          "Invalid storage capacity (Must be a positive value less than 10",
      });
    }
    if (appData.storage.port < 0 || appData.storage.port > 65535) {
      return json(400, res, {
        code: 400,
        message: "Invalid port number",
      });
    }
  }

  try {
    validateEnv(appConfig.env, appConfig.secrets);
    if (appData.storage && appData.storage.env.length !== 0) {
      validateEnv(appData.storage.env, []);
    }
  } catch (err) {
    return json(400, res, { code: 400, message: err.message });
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
        include: { config: true, storageConfig: true },
      },
    },
  });

  if (!app) {
    return json(401, res, {});
  }

  if (!app.deployments) {
    return json(400, res, {});
  }

  if (appConfig.branch || appData.name) {
    await db.app.update({
      where: { id: app.id },
      data: {
        repositoryBranch: appConfig.branch ?? app.repositoryBranch,
        displayName: appData.name ?? app.displayName,
      },
    });
  }

  const lastDeployment = app.deployments[0];
  let lastDeploymentConfig = app.deployments[0].config;
  delete lastDeploymentConfig.id;

  if (lastDeployment.status != "ERROR") {
    await db.deployment.update({
      where: { id: lastDeployment.id },
      data: { status: "STOPPED" },
    });
  }

  if (appConfig.branch !== app.repositoryBranch) {
    const githubInstallationId = await db.organization
      .findFirst({
        where: {
          apps: {
            some: {
              id: app.id,
            },
          },
        },
        select: {
          githubInstallationId: true,
        },
      })
      .then((res) => res.githubInstallationId);
    const octokit = await getOctokit(githubInstallationId);
    const repo = await getRepoById(octokit, app.repositoryId);
    try {
      await buildAndDeploy({
        appId: app.id,
        orgId: app.orgId,
        imageRepo: app.imageRepo,
        commitSha: lastDeployment.commitHash,
        commitMessage: `Redeploy of ${lastDeployment.commitHash.slice(0, 8)}`,
        cloneURL: await generateCloneURLWithCredentials(octokit, repo.html_url),
        config: {
          port: appData.config.port,
          env: appData.config.env,
          secrets: appData.config.secrets
            ? JSON.stringify(appData.config.secrets)
            : undefined,
          builder: appData.config.builder,
          dockerfilePath: appData.config.dockerfilePath,
          rootDir: appData.config.rootDir,
        },
        storageConfig: appData.storage
          ? {
              ...appData.storage,
              env: appData.storage.env as Env[],
            }
          : undefined,
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

  const deployment = await db.deployment.create({
    data: {
      config: {
        create: {
          builder: appData.config.builder,
          port: appData.config.port,
          rootDir: appData.config.rootDir,
          dockerfilePath: appData.config.dockerfilePath,
          env: appData.config.env,
          replicas: appData.config.replicas,
          secrets: JSON.stringify(appData.config.secrets),
        },
      },
      storageConfig: appData.storage ? { create: appData.storage } : undefined,
      status: "DEPLOYING",
      app: { connect: { id: app.id } },
      imageTag: lastDeployment.imageTag,
      commitHash: lastDeployment.commitHash,
      commitMessage: `Redeploy of #${lastDeployment.id}`,
      secret,
    },
  });

  const appParams = {
    deploymentId: deployment.id,
    appId: app.id,
    name: app.name,
    namespace: NAMESPACE_PREFIX + app.subdomain,
    image: deployment.imageTag,
    env: appData.config.env,
    secrets: appData.config.secrets,
    port: lastDeploymentConfig.port,
    replicas: lastDeploymentConfig.replicas,
    storage: appData.storage
      ? {
          ...appData.storage,
          env: appData.storage?.env,
        }
      : undefined,
    loggingIngestSecret: app.logIngestSecret,
  };

  for (let key in ["name", "env", "secrets", "port", "replicas", "storage"]) {
    appParams[key] = appData.config[key];
  }

  const { namespace, configs } = createAppConfigs(appParams);
  try {
    await createOrUpdateApp(app.name, namespace, configs);
    await db.deployment.update({
      where: { id: deployment.id },
      data: { status: "COMPLETE" },
    });
    if (appData.storage === null && lastDeployment.storageConfig) {
      await deleteStorage(app.name, NAMESPACE_PREFIX + app.subdomain);
    }
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
