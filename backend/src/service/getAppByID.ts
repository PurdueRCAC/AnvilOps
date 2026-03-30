import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import type { DeploymentConfigService } from "./common/deploymentConfig.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { AppNotFoundError, InstallationNotFoundError } from "./errors/index.ts";

export class GetAppByIDService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;
  private deploymentConfigService: DeploymentConfigService;
  private gitProviderFactoryService: GitProviderFactoryService;
  private kubernetesService: KubernetesClientService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
    deploymentConfigService: DeploymentConfigService,
    gitProviderFactoryService: GitProviderFactoryService,
    kubernetesService: KubernetesClientService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
    this.deploymentConfigService = deploymentConfigService;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.kubernetesService = kubernetesService;
  }

  async getAppByID(appId: number, userId: number) {
    const [app, recentDeployment, deploymentCount] = await Promise.all([
      this.appRepo.getById(appId, { requireUser: { id: userId } }),
      this.appRepo.getMostRecentDeployment(appId),
      this.appRepo.getDeploymentCount(appId),
    ]);

    if (!app) {
      throw new AppNotFoundError();
    }

    // Fetch the current StatefulSet to read its labels
    const getK8sDeployment = async () => {
      try {
        const { AppsV1Api: api } =
          await this.kubernetesService.getClientsForRequest(
            userId,
            app.projectId,
            ["AppsV1Api"],
          );
        return await api.readNamespacedStatefulSet({
          namespace: app.namespace,
          name: app.name,
        });
      } catch (e) {
        logger.error(e, "Failed to read StatefulSet of deployment");
      }
    };

    const [org, appGroup, currentConfig, activeDeployment] = await Promise.all([
      this.orgRepo.getById(app.orgId),
      this.appGroupRepo.getById(app.appGroupId),
      this.deploymentRepo.getConfig(recentDeployment.id),
      getK8sDeployment().then(
        (d) =>
          d?.spec?.template?.metadata?.labels?.[
            "anvilops.rcac.purdue.edu/deployment-id"
          ],
      ),
    ]);

    // Fetch repository info if this app is deployed from a Git repository
    let repoId: number = undefined,
      repoURL: string = undefined;

    if (
      currentConfig.appType === "workload" &&
      currentConfig.source === "GIT"
    ) {
      repoId = currentConfig.repositoryId;
      try {
        const gitProvider = await this.gitProviderFactoryService.getGitProvider(
          org.id,
        );
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
      config:
        this.deploymentConfigService.formatDeploymentConfig(currentConfig),
      appGroup: {
        standalone: appGroup.isMono,
        name: !appGroup.isMono ? appGroup.name : undefined,
        id: app.appGroupId,
      },
      activeDeployment: activeDeployment
        ? parseInt(activeDeployment)
        : undefined,
      deploymentCount,
    };
  }
}
