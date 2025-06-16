import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { k8s } from "../lib/kubernetes.ts";
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

  let logs: string | undefined;
  try {
    const pods = await k8s.default.listNamespacedPod({
      namespace: "anvilops-dev",
      labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
    });

    if (pods.items.length !== 1) {
      throw new Error(
        "Invalid response - job is probably not available anymore",
      );
    }

    const pod = pods.items[0];

    logs = await k8s.default.readNamespacedPodLog({
      namespace: "anvilops-dev",
      name: pod.metadata.name,
    });
  } catch {
    // Logs are unavailable - don't let that prevent us from returning the rest of the information
  }

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
    },
    logs,
  });
};
