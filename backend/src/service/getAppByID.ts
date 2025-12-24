import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import {
  AppNotFoundError,
  InstallationNotFoundError,
} from "./common/errors.ts";

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
  let repoId = currentConfig.repositoryId,
    repoURL: string = undefined;

  if (currentConfig.source === "GIT") {
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
    config: {
      createIngress: currentConfig.createIngress,
      subdomain: currentConfig.createIngress
        ? currentConfig.subdomain
        : undefined,
      collectLogs: currentConfig.collectLogs,
      port: currentConfig.port,
      env: currentConfig.displayEnv,
      replicas: currentConfig.replicas,
      requests: currentConfig.requests,
      limits: currentConfig.limits,
      mounts: currentConfig.mounts.map((mount) => ({
        amountInMiB: mount.amountInMiB,
        path: mount.path,
        volumeClaimName: generateVolumeName(mount.path),
      })),
      ...(currentConfig.source === "GIT"
        ? {
            source: "git" as const,
            branch: currentConfig.branch,
            dockerfilePath: currentConfig.dockerfilePath,
            rootDir: currentConfig.rootDir,
            builder: currentConfig.builder,
            repositoryId: currentConfig.repositoryId,
            event: currentConfig.event,
            eventId: currentConfig.eventId,
            commitHash: currentConfig.commitHash,
          }
        : {
            source: "image" as const,
            imageTag: currentConfig.imageTag,
          }),
    },
    appGroup: {
      standalone: appGroup.isMono,
      name: !appGroup.isMono ? appGroup.name : undefined,
      id: app.appGroupId,
    },
    activeDeployment: activeDeployment ? parseInt(activeDeployment) : undefined,
    deploymentCount,
  };
}
