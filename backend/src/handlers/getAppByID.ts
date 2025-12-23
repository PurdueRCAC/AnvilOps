import { db } from "../db/index.ts";
import { deploymentConfigValidator } from "../domain/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppByID: HandlerMap["getAppByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appId = ctx.request.params.appId;

  const [app, recentDeployment, deploymentCount] = await Promise.all([
    db.app.getById(appId, { requireUser: { id: req.user.id } }),
    db.app.getMostRecentDeployment(appId),
    db.app.getDeploymentCount(appId),
  ]);

  if (!app) return json(404, res, { code: 404, message: "App not found." });

  // Fetch the current StatefulSet to read its labels
  const getK8sDeployment = async () => {
    try {
      const { AppsV1Api: api } = await getClientsForRequest(
        req.user.id,
        app.projectId,
        ["AppsV1Api"],
      );
      return await api.readNamespacedStatefulSet({
        namespace: getNamespace(app.namespace),
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
  const { repoId, repoURL } = await (async () => {
    if (currentConfig.source === "GIT" && org.githubInstallationId) {
      const octokit = await getOctokit(org.githubInstallationId);
      const repo = await getRepoById(octokit, currentConfig.repositoryId);
      return { repoId: repo.id, repoURL: repo.html_url };
    } else {
      return { repoId: undefined, repoURL: undefined };
    }
  })();

  // TODO: Separate this into several API calls
  return json(200, res, {
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
    config: deploymentConfigValidator.formatDeploymentConfig(currentConfig),
    appGroup: {
      standalone: appGroup.isMono,
      name: !appGroup.isMono ? appGroup.name : undefined,
      id: app.appGroupId,
    },
    activeDeployment: activeDeployment ? parseInt(activeDeployment) : undefined,
    deploymentCount,
  });
};
