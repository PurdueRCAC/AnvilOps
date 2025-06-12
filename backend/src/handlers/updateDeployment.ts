import { db } from "../lib/db.ts";
import {
  createDeploymentConfig,
  createOrUpdateApp,
  createServiceConfig,
} from "../lib/kubernetes.ts";
import { type Env, type HandlerMap, json, type Secrets } from "../types.ts";

export const updateDeployment: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } = ctx.request.requestBody;

  if (!secret) {
    return json(401, res, {});
  }

  if (!["BUILDING", "DEPLOYING", "ERROR"].some((it) => status === it)) {
    return json(400, res, {});
  }
  const batch = await db.deployment.updateManyAndReturn({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" | "ERROR" },
    include: { config: true },
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
      const appParams = {
        name: app.name,
        namespace: subdomain,
        image: deployment.imageTag,
        env: deployment.config.env as Env,
        secrets: JSON.parse(deployment.config.secrets) as Secrets[],
        port: deployment.config.port,
        replicas: deployment.config.replicas,
      };
      const deployConfig = createDeploymentConfig(appParams);
      const svcConfig = createServiceConfig(appParams, subdomain);
      try {
        await createOrUpdateApp(
          subdomain,
          deployConfig,
          svcConfig,
          JSON.parse(deployment.config.secrets) as Secrets[],
        );
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
    }
  }

  return json(200, res, {});
};
