import { JsonObject } from "@prisma/client/runtime/library";
import { db } from "../lib/db.ts";
import { Env, json, Secrets, type HandlerMap } from "../types.ts";
import {
  createAppInNamespace,
  createDeploymentConfig,
  createNamespace,
  createSecret,
  createServiceConfig,
} from "../lib/kubernetes.ts";

export const updateDeployment: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } =
    ctx.request.requestBody.content["application/json"];

  if (!secret) {
    return json(401, res, {});
  }

  if (!(status in ["BUILDING", "DEPLOYING"])) return json(400, res, {});

  const batch = await db.deployment.updateManyAndReturn({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" },
  });

  if (batch.length === 0) {
    return json(403, res, {});
  }

  if (status === "DEPLOYING") {
    for (let deployment of batch) {
      const app = await db.app.findUnique({
        where: {
          id: deployment.appId,
        },
      });

      const subdomain = app.subdomain;
      try {
        await createNamespace(subdomain);

        for (let secret in app.secrets as Secrets) {
          await createSecret(subdomain, secret, app.secrets[secret]);
        }

        const appParams = {
          name: app.name,
          image: deployment.imageTag,
          env: app.env as Env,
          secrets: app.secrets as Secrets,
          port: app.port,
          replicas: 1,
        };
        const deployConfig = createDeploymentConfig(appParams);
        const svcConfig = createServiceConfig(appParams, subdomain);

        await createAppInNamespace({
          namespace: subdomain,
          deployment: deployConfig,
          service: svcConfig,
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
    }
  }

  return json(200, res, {});
};
