import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { db } from "../lib/db.ts";
import { validateDeploymentConfig } from "../lib/validate.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { withSensitiveEnv } from "./updateApp.ts";

export const updateAppConfigTemplate: HandlerMap["updateAppConfigTemplate"] =
  async (ctx, req: AuthenticatedRequest, res) => {
    const appConfig = ctx.request.requestBody;

    const originalApp = await db.app.findUnique({
      where: {
        id: ctx.request.params.appId,
        org: { users: { some: { userId: req.user.id } } },
      },
      include: {
        deploymentConfigTemplate: true,
        org: { select: { githubInstallationId: true } },
        appGroup: true,
      },
    });

    if (!originalApp) {
      return json(401, res, {});
    }

    const validation = validateDeploymentConfig(appConfig);
    if (!validation.valid) {
      return json(400, res, { code: 400, message: validation.message });
    }

    const updatedConfig: DeploymentConfigCreateInput = {
      // Null values for unchanged sensitive vars need to be replaced with their true values
      env: withSensitiveEnv(
        originalApp.deploymentConfigTemplate.getPlaintextEnv(),
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

    await db.$transaction(async (tx) => {
      const config = await tx.deploymentConfig.create({
        data: updatedConfig,
        select: {
          id: true,
        },
      });
      await tx.app.update({
        where: { id: originalApp.id },
        data: {
          deploymentConfigTemplate: {
            connect: {
              id: config.id,
            },
          },
          isPreviewing: false,
        },
      });
      await tx.deploymentConfig.delete({
        where: { id: originalApp.deploymentConfigTemplate.id },
      });
    });

    return json(200, res, {});
  };
