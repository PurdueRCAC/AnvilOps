import { V1PodList } from "@kubernetes/client-node";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getNamespace, k8s } from "../lib/kubernetes.ts";
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
      config: { include: { mounts: true } },
      app: { select: { subdomain: true, name: true } },
    },
  });

  if (!deployment) {
    return json(404, res, {});
  }

  let pods: V1PodList;
  try {
    pods = await k8s.default.listNamespacedPod({
      namespace: getNamespace(deployment.app.subdomain),
      labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
    });
  } catch (err) {
    // Namespace may not be ready yet
    pods = { apiVersion: "v1", items: [] };
  }

  const podStatus = pods?.items?.[0]?.status;
  let scheduled = 0,
    ready = 0,
    failed = 0;

  for (const pod of pods?.items ?? []) {
    if (
      pod?.status?.conditions?.find((it) => it.type === "PodScheduled")
        ?.status === "True"
    ) {
      scheduled++;
    }
    if (
      pod?.status?.conditions?.find((it) => it.type === "Ready")?.status ===
      "True"
    ) {
      ready++;
    }
    if (
      pod?.status?.phase === "Failed" ||
      pod?.status?.containerStatuses?.[0]?.state?.terminated
    ) {
      failed++;
    }
  }

  return json(200, res, {
    commitHash: deployment.commitHash,
    commitMessage: deployment.commitMessage,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    id: deployment.id,
    appId: deployment.appId,
    status: deployment.status,
    podStatus: podStatus
      ? {
          scheduled,
          ready,
          total: pods.items.length,
          failed,
        }
      : undefined,
    config: {
      branch: deployment.config.branch,
      imageTag: deployment.config.imageTag,
      mounts: deployment.config.mounts.map((mount) => ({
        path: mount.path,
        amountInMiB: mount.amountInMiB,
      })),
      source: deployment.config.source === "GIT" ? "git" : "image",
      repositoryId: deployment.config.repositoryId,
      builder: deployment.config.builder,
      dockerfilePath: deployment.config.dockerfilePath,
      env: deployment.config.displayEnv,
      port: deployment.config.port,
      replicas: deployment.config.replicas,
      rootDir: deployment.config.rootDir,
    },
  });
};
