import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { json, type HandlerMap } from "../types.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";

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
      app: {
        select: {
          subdomain: true,
          name: true,
          org: {
            select: { githubInstallationId: true },
          },
          appGroup: { select: { projectId: true } },
        },
      },
    },
  });

  if (!deployment) {
    return json(404, res, {});
  }

  const { CoreV1Api: api } = await getClientsForRequest(
    req.user.id,
    deployment.app.appGroup.projectId,
    ["CoreV1Api"],
  );
  const [repositoryURL, pods] = await Promise.all([
    (async () => {
      if (deployment.config.source === "GIT") {
        const octokit = await getOctokit(
          deployment.app.org.githubInstallationId,
        );
        const repo = await getRepoById(octokit, deployment.config.repositoryId);
        return repo.html_url;
      }
      return undefined;
    })(),

    api
      .listNamespacedPod({
        namespace: getNamespace(deployment.app.subdomain),
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deployment.id}`,
      })
      .catch(
        // Namespace may not be ready yet
        () => ({ apiVersion: "v1", items: [] }),
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

  return json(200, res, {
    repositoryURL,
    commitHash: deployment.commitHash,
    commitMessage: deployment.commitMessage,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
    id: deployment.id,
    appId: deployment.appId,
    status: deployment.status,
    podStatus: {
      scheduled,
      ready,
      total: pods.items.length,
      failed,
    },
    config: {
      branch: deployment.config.branch,
      imageTag: deployment.config.imageTag,
      mounts: deployment.config.fieldValues.mounts.map((mount) => ({
        path: mount.path,
        amountInMiB: mount.amountInMiB,
      })),
      source: deployment.config.source === "GIT" ? "git" : "image",
      repositoryId: deployment.config.repositoryId,
      event: deployment.config.event,
      eventId: deployment.config.eventId,
      builder: deployment.config.builder,
      dockerfilePath: deployment.config.dockerfilePath,
      env: deployment.config.displayEnv,
      port: deployment.config.fieldValues.port,
      replicas: deployment.config.fieldValues.replicas,
      rootDir: deployment.config.rootDir,
    },
  });
};
