import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppConfigTemplate: HandlerMap["getAppConfigTemplate"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appId = ctx.request.params.appId;
  const app = await db.app.findUnique({
    where: {
      id: appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: {
      deploymentConfigTemplate: true,
    },
  });

  if (!app) return json(404, res, {});

  return json(200, res, {
    config: {
      port: app.deploymentConfigTemplate.fieldValues.port,
      env: app.deploymentConfigTemplate.displayEnv,
      replicas: app.deploymentConfigTemplate.fieldValues.replicas,
      mounts: app.deploymentConfigTemplate.fieldValues.mounts.map((mount) => ({
        amountInMiB: mount.amountInMiB,
        path: mount.path,
        volumeClaimName: generateVolumeName(mount.path),
      })),
      ...app.deploymentConfigTemplate.fieldValues.extra,
      ...(app.deploymentConfigTemplate.source === "GIT"
        ? {
            source: "git" as const,
            branch: app.deploymentConfigTemplate.branch,
            dockerfilePath: app.deploymentConfigTemplate.dockerfilePath,
            rootDir: app.deploymentConfigTemplate.rootDir,
            builder: app.deploymentConfigTemplate.builder,
            repositoryId: app.deploymentConfigTemplate.repositoryId,
            event: app.deploymentConfigTemplate.event,
            eventId: app.deploymentConfigTemplate.eventId,
            imageTag: undefined,
          }
        : {
            source: "image",
            imageTag: app.deploymentConfigTemplate.imageTag,
          }),
    },
  });
};
