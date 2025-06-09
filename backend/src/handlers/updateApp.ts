import { Context } from "openapi-backend";
import { components } from "../generated/openapi.ts";
import {
  Env,
  HandlerResponse,
  json,
  Secrets,
  type HandlerMap,
} from "../types.ts";
import { AuthenticatedRequest } from "../lib/api.ts";
import { type Response as ExpressResponse } from "express";
import { db } from "../lib/db.ts";
import { createBuildJob } from "../lib/builder.ts";
import {
  createDeploymentConfig,
  createOrUpdateApp,
  createServiceConfig,
} from "../lib/kubernetes.ts";

const updateApp: HandlerMap["updateApp"] = async (
  ctx: Context<
    { content: { "application/json": components["schemas"]["App"] } },
    { appId: number }
  >,
  req: AuthenticatedRequest,
  res: ExpressResponse,
): Promise<
  HandlerResponse<{
    200: { headers: { [name: string]: unknown }; content?: never };
    401: { headers: { [name: string]: unknown }; content?: never };
    500: {
      headers: { [name: string]: unknown };
      content: { "application/json": components["schemas"]["ApiError"] };
    };
  }>
> => {
  const appData = ctx.request.requestBody.content["application/json"];
  const app = await db.app.findUnique({
    where: {
      id: appData.id,
      orgId: appData.orgId,
    },
    include: {
      deployments: true,
    },
  });

  if (!app) {
    return json(401, res, {});
  }

  const updates = { ...appData.config };

  if (!updates) {
    return json(500, res, { code: 500, message: "No update provided" });
  }

  for (let deployment of app.deployments) {
    const appParams = {
      name: app.name,
      namespace: app.subdomain,
      image: deployment.imageTag,
      env: app.env as Env,
      secrets: app.secrets as Secrets,
      port: app.port,
      replicas: app.replicas,
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
  }

  return json(200, res, {});
};

export default updateApp;
