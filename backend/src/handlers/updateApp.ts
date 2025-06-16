import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { createAppConfigs, createOrUpdateApp } from "../lib/kubernetes.ts";
import { type Env, type HandlerMap, json } from "../types.ts";

const updateApp: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res: ExpressResponse,
) => {
  const appData = ctx.request.requestBody;
  const app = await db.app.findUnique({
    where: {
      id: appData.id,
      orgId: appData.orgId,
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
      storageConfig: appData.storage && { create: appData.storage },
      status: "DEPLOYING",
      app: { connect: { id: app.id } },
      imageTag: lastDeployment.imageTag,
      commitHash: lastDeployment.commitHash,
      commitMessage: `Redeploy of #${lastDeployment.id}`,
      secret,
    },
  });

  const appParams = {
    name: app.name,
    namespace: app.subdomain,
    image: deployment.imageTag,
    env: appData.config.env,
    secrets: appData.config.secrets,
    port: lastDeploymentConfig.port,
    replicas: lastDeploymentConfig.replicas,
    storage: appData.storage,
  };

  for (let key in appData.config) {
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
