import { type Response as ExpressResponse } from "express";
import { randomBytes } from "node:crypto";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import {
  createDeploymentConfig,
  createOrUpdateApp,
  createServiceConfig,
} from "../lib/kubernetes.ts";
import { type Env, type HandlerMap, json, type Secrets } from "../types.ts";

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

  const updates = { ...appData.config };

  if (!updates) {
    return json(500, res, { code: 500, message: "No update provided" });
  }

  if (!app.deployments) {
    return json(400, res, {});
  }

  const lastDeployment = app.deployments[0];
  let lastDeploymentConfig = app.deployments[0].config;
  delete lastDeploymentConfig.id;

  const secret = randomBytes(32).toString("hex");

  const deployment = await db.deployment.create({
    data: {
      config: { create: lastDeploymentConfig },
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
    env: lastDeploymentConfig.env as Env,
    secrets: JSON.parse(lastDeploymentConfig.secrets) as Secrets[],
    port: lastDeploymentConfig.port,
    replicas: lastDeploymentConfig.replicas,
  };

  for (let key in updates) {
    appParams[key] = updates[key];
  }

  const deployConfig = createDeploymentConfig(appParams);
  const svcConfig = createServiceConfig(appParams, app.subdomain);
  const secrets = appParams.secrets;
  try {
    await createOrUpdateApp(app.subdomain, deployConfig, svcConfig, secrets);
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
