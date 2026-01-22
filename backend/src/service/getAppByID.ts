import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { AppNotFoundError } from "./common/errors.ts";
import { deploymentConfigService } from "./helper/index.ts";

export async function getAppByID(appId: number, userId: number) {
  const [app, recentDeployment, deploymentCount] = await Promise.all([
    db.app.getById(appId, { requireUser: { id: userId } }),
    db.app.getMostRecentDeployment(appId),
    db.app.getDeploymentCount(appId),
  ]);

  if (!app) {
    throw new AppNotFoundError();
  }

  const [org, appGroup, currentConfig] = await Promise.all([
    db.org.getById(app.orgId),
    db.appGroup.getById(app.appGroupId),
    db.deployment.getConfig(recentDeployment.id),
  ]);

  // Fetch the current StatefulSet to read its labels
  const getK8sDeployment = async () => {
    if (currentConfig.appType !== "workload") {
      return null;
    }
    try {
      const { AppsV1Api: api } = await getClientsForRequest(
        userId,
        app.projectId,
        ["AppsV1Api"],
      );
      if (currentConfig.asWorkloadConfig().mounts.length > 0) {
        return await api.readNamespacedStatefulSet({
          namespace: app.namespace,
          name: app.name,
        });
      } else {
        return await api.readNamespacedDeployment({
          namespace: app.namespace,
          name: app.name,
        });
      }
    } catch {}
  };

  // Fetch repository info if this app is deployed from a Git repository
  const [{ repoId, repoURL }, activeDeployment] = await Promise.all([
    (async () => {
      if (currentConfig.source === "GIT" && org.githubInstallationId) {
        const octokit = await getOctokit(org.githubInstallationId);
        const repo = await getRepoById(octokit, currentConfig.repositoryId);
        return { repoId: repo.id, repoURL: repo.html_url };
      } else {
        return { repoId: undefined, repoURL: undefined };
      }
    })(),
    getK8sDeployment(),
  ]);

  const activeDeploymentId =
    activeDeployment?.metadata?.labels?.[
      "anvilops.rcac.purdue.edu/deployment-id"
    ];

  return {
    id: app.id,
    orgId: app.orgId,
    projectId: app.projectId,
    name: app.name,
    displayName: app.displayName,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    repositoryId: repoId,
    repositoryURL: repoURL,
    cdEnabled: app.enableCD,
    namespace: app.namespace,
    config: deploymentConfigService.formatDeploymentConfig(currentConfig),
    appGroup: {
      standalone: appGroup.isMono,
      name: !appGroup.isMono ? appGroup.name : undefined,
      id: app.appGroupId,
    },
    activeDeployment: activeDeploymentId
      ? parseInt(activeDeploymentId)
      : undefined,
    deploymentCount,
  };
}
