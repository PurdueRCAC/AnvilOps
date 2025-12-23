import type { V1Pod } from "@kubernetes/client-node";
import { db } from "../db/index.ts";
import { deploymentConfigValidator } from "../domain/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getDeployment: HandlerMap["getDeployment"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const deployment = await db.deployment.getById(
    ctx.request.params.deploymentId,
    {
      requireUser: { id: req.user.id },
    },
  );

  if (!deployment) {
    return json(404, res, { code: 404, message: "Deployment not found." });
  }

  const [config, app] = await Promise.all([
    db.deployment.getConfig(deployment.id),
    db.app.getById(deployment.appId),
  ]);

  const org = await db.org.getById(app.orgId);

  const { CoreV1Api: api } = await getClientsForRequest(
    req.user.id,
    app.projectId,
    ["CoreV1Api"],
  );
  const [repositoryURL, pods] = await Promise.all([
    (async () => {
      if (config.source === "GIT") {
        const octokit = await getOctokit(org.githubInstallationId);
        const repo = await getRepoById(octokit, config.repositoryId);
        return repo.html_url;
      }
      return undefined;
    })(),

    api
      .listNamespacedPod({
        namespace: getNamespace(app.namespace),
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
      })
      .catch(
        // Namespace may not be ready yet
        () => ({ apiVersion: "v1", items: [] as V1Pod[] }),
      ),
  ]);

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
    deployment.status === "COMPLETE" && scheduled + ready + failed === 0
      ? "STOPPED"
      : deployment.status;

  return json(200, res, {
    repositoryURL,
    commitHash: config.source === "GIT" ? config.commitHash : "unknown",
    commitMessage: deployment.commitMessage,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    id: deployment.id,
    appId: deployment.appId,
    status: status,
    podStatus: {
      scheduled,
      ready,
      total: pods.items.length,
      failed,
    },
    config: deploymentConfigValidator.formatDeploymentConfig(config),
  });
};
