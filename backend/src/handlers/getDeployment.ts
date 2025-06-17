import { LogType } from "../generated/prisma/enums.ts";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

export const getDeployment: HandlerMap["getDeployment"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const deployment = await db.deployment.findFirst({
    where: {
      id: ctx.request.params.deploymentId,
      appId: ctx.request.params.appId,
      app: { org: { users: { some: { userId: req.user.id } } } },
    },
    include: {
      config: true,
      storageConfig: true,
      app: { select: { repositoryBranch: true } },
    },
  });

  if (!deployment) {
    return json(404, res, {});
  }

  const logs = await db.log.findMany({
    where: { deploymentId: deployment.id, type: LogType.BUILD },
    orderBy: { timestamp: "asc" },
    take: 5000,
  });

  return json(200, res, {
    commitHash: deployment.commitHash,
    commitMessage: deployment.commitMessage,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    id: deployment.id,
    status: deployment.status,
    config: {
      branch: deployment.app.repositoryBranch,
      builder: deployment.config.builder,
      dockerfilePath: deployment.config.dockerfilePath,
      env: deployment.config.env as { name: string; value: string }[],
      port: deployment.config.port,
      replicas: deployment.config.replicas,
      rootDir: deployment.config.rootDir,
      secrets: JSON.parse(deployment.config.secrets),
    },
    storageConfig: {
      amount: deployment.storageConfig?.amount,
      image: deployment.storageConfig?.image,
      replicas: deployment.storageConfig?.replicas,
      port: deployment.storageConfig?.port,
      mountPath: deployment.storageConfig?.mountPath,
    },
    logs: logs
      .map((line) => ((line.content as any).log as string).trim())
      .join("\n"),
  });
};
