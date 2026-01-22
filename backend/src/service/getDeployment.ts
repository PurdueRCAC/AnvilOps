import type { V1Pod, V1PodList } from "@kubernetes/client-node";
import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { DeploymentNotFoundError } from "./common/errors.ts";
import { deploymentConfigService } from "./helper/index.ts";

export async function getDeployment(deploymentId: number, userId: number) {
  const deployment = await db.deployment.getById(deploymentId, {
    requireUser: { id: userId },
  });

  if (!deployment) {
    throw new DeploymentNotFoundError();
  }

  const [config, app] = await Promise.all([
    db.deployment.getConfig(deployment.id),
    db.app.getById(deployment.appId),
  ]);

  const org = await db.org.getById(app.orgId);

  const { CoreV1Api: api } = await getClientsForRequest(userId, app.projectId, [
    "CoreV1Api",
  ]);

  let repositoryURL: string | null = null;
  let pods: V1PodList | null = null;
  if (config.source === "GIT") {
    const gitProvider = await getGitProvider(org.id);
    const repo = await gitProvider?.getRepoById(config.repositoryId);
    repositoryURL = repo?.htmlURL;
  }
  if (config.appType === "workload") {
    pods = await api
      .listNamespacedPod({
        namespace: app.namespace,
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
      })
      .catch(() => ({ apiVersion: "v1", items: [] as V1Pod[] }));
  }

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

  const status =
    deployment.status === "COMPLETE" &&
    config.appType === "workload" &&
    scheduled + ready + failed === 0
      ? ("STOPPED" as const)
      : deployment.status;

  let title: string;
  switch (config.source) {
    case "GIT":
      title = deployment.commitMessage;
      break;
    case "IMAGE":
      title = config.imageTag;
      break;
    case "HELM":
      title = config.url;
      break;
    default:
      title = "Unknown";
      break;
  }

  const podStatus =
    config.appType === "workload"
      ? {
          scheduled,
          ready,
          total: pods.items.length,
          failed,
        }
      : null;

  return {
    repositoryURL,
    title,
    commitHash: config.source === "GIT" ? config.commitHash : null,
    commitMessage: config.source === "GIT" ? deployment.commitMessage : null,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    id: deployment.id,
    appId: deployment.appId,
    status,
    podStatus,
    config: deploymentConfigService.formatDeploymentConfig(config),
  };
}
