import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

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
          namespace: true,
          name: true,
          org: {
            select: { githubInstallationId: true },
          },
          projectId: true,
        },
      },
    },
  });

  if (!deployment) {
    return json(404, res, { code: 404, message: "Deployment not found." });
  }

  const { CoreV1Api: api } = await getClientsForRequest(
    req.user.id,
    deployment.app.projectId,
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
        namespace: getNamespace(deployment.app.namespace),
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
    commitHash: deployment.config.commitHash,
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
      ...(deployment.config.source === "GIT"
        ? {
            source: "git",
            branch: deployment.config.branch,
            imageTag: deployment.config.imageTag,
            repositoryId: deployment.config.repositoryId,
            event: deployment.config.event,
            eventId: deployment.config.eventId,
            commitHash: deployment.config.commitHash,
            builder: deployment.config.builder,
            dockerfilePath: deployment.config.dockerfilePath,
            rootDir: deployment.config.rootDir,
          }
        : {
            source: "image",
            imageTag: deployment.config.imageTag,
          }),
      env: deployment.config.displayEnv,
      mounts: deployment.config.mounts,
      port: deployment.config.port,
      replicas: deployment.config.replicas,
      createIngress: deployment.config.createIngress,
      collectLogs: deployment.config.collectLogs,
      requests: deployment.config.requests,
      limits: deployment.config.limits,
    },
  });
};
