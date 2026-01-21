import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import {
  AppNotFoundError,
  InstallationNotFoundError,
} from "./common/errors.ts";
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

  // Fetch the current StatefulSet to read its labels
  const getK8sDeployment = async () => {
    try {
      const { AppsV1Api: api } = await getClientsForRequest(
        userId,
        app.projectId,
        ["AppsV1Api"],
      );
      return await api.readNamespacedStatefulSet({
        namespace: app.namespace,
        name: app.name,
      });
    } catch {}
  };

  const [org, appGroup, currentConfig, activeDeployment] = await Promise.all([
    db.org.getById(app.orgId),
    db.appGroup.getById(app.appGroupId),
    db.deployment.getConfig(recentDeployment.id),
    (await getK8sDeployment())?.spec?.template?.metadata?.labels?.[
      "anvilops.rcac.purdue.edu/deployment-id"
    ],
  ]);

  // Fetch repository info if this app is deployed from a Git repository
  let repoId: number = undefined,
    repoURL: string = undefined;

  if (currentConfig.appType === "workload" && currentConfig.source === "GIT") {
    repoId = currentConfig.repositoryId;
    try {
      const gitProvider = await getGitProvider(org.id);
      const repo = await gitProvider.getRepoById(currentConfig.repositoryId);
      repoURL = repo.htmlURL;
    } catch (e) {
      if (!(e instanceof InstallationNotFoundError)) {
        throw e;
      }
    }
  }

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
    activeDeployment: activeDeployment ? parseInt(activeDeployment) : undefined,
    deploymentCount,
  };
}
