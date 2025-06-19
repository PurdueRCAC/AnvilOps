import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { createAppConfigs, createOrUpdateApp } from "../lib/kubernetes.ts";
import { type Env, type HandlerMap, json } from "../types.ts";
import { validateEnv } from "./createApp.ts";

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

  if (appConfig.dockerfilePath) {
    if (
      appConfig.dockerfilePath.startsWith("/") ||
      appConfig.dockerfilePath.includes(`"`)
    ) {
      return json(400, res, { code: 400, message: "Invalid Dockerfile path" });
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
          createdAt: "asc",
        },
        take: 1,
        include: { config: true },
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
        name: appData.name ?? app.name,
      },
    });
  }

  const lastDeployment = app.deployments[0];
  let lastDeploymentConfig = app.deployments[0].config;
  delete lastDeploymentConfig.id;

  const secret = randomBytes(32).toString("hex");

  const config = {
    ...appData.config,
    secrets: JSON.stringify(appData.config.secrets),
  };
  const deployment = await db.deployment.create({
    data: {
      config: {
        create: config,
      },
      storageConfig: appData.storage ? { create: appData.storage } : null,
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
    namespace: app.subdomain,
    image: deployment.imageTag,
    env: appData.config.env,
    secrets: appData.config.secrets,
    port: lastDeploymentConfig.port,
    replicas: lastDeploymentConfig.replicas,
    storage: {
      ...appData.storage,
      env: appData.storage.env as Env[],
    },
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
