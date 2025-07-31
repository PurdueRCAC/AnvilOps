import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import { buildAndDeploy } from "./githubWebhook.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { withSensitiveEnv } from "./updateApp.ts";

export const createDeployment: HandlerMap["createDeployment"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appConfig = ctx.request.requestBody;

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
    return json(404, res, {});
  }

  const deploymentConfig: DeploymentConfigCreateInput = {
    // Null values for unchanged sensitive vars need to be replaced with their true values
    env: withSensitiveEnv(
      app.deploymentConfigTemplate.getPlaintextEnv(),
      appConfig.env,
    ),
    fieldValues: {
      replicas: appConfig.replicas,
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

  await buildAndDeploy({
    appId: app.id,
    orgId: app.orgId,
    commitMessage: "Manual deployment",
    commitSha: "",
    config: deploymentConfig,
    imageRepo: app.imageRepo,
    createCheckRun: false,
  });

  return json(201, res, {});
};
