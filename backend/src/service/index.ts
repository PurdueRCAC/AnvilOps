import { db } from "../db/index.ts";
import { AcceptInvitationService } from "./acceptInvitation.ts";
import { ClaimOrgService } from "./claimOrg.ts";
import { AppService } from "./common/app.ts";
import { BuilderService } from "./common/builder.ts";
import { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { RancherService } from "./common/cluster/rancher.ts";
import { ClusterResourcesService } from "./common/cluster/resources.ts";
import { IngressConfigService } from "./common/cluster/resources/ingress.ts";
import { LogCollectionService } from "./common/cluster/resources/logs.ts";
import { ServiceConfigService } from "./common/cluster/resources/service.ts";
import { StatefulSetConfigService } from "./common/cluster/resources/statefulset.ts";
import { DeploymentService } from "./common/deployment.ts";
import { DeploymentConfigService } from "./common/deploymentConfig.ts";
import { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { HelmService } from "./common/helm.ts";
import { RegistryService } from "./common/registry.ts";
import { CreateAppService } from "./createApp.ts";
import { CreateAppGroupService } from "./createAppGroup.ts";
import { CreateOrgService } from "./createOrg.ts";
import { DeleteAppService } from "./deleteApp.ts";
import { DeleteAppPodService } from "./deleteAppPod.ts";
import { DeleteOrgByIDService } from "./deleteOrgByID.ts";
import { FileBrowserService } from "./files.ts";
import { GetAppByIDService } from "./getAppByID.ts";
import { GetAppLogsService } from "./getAppLogs.ts";
import { GetAppStatusService } from "./getAppStatus.ts";
import { GetDeploymentService } from "./getDeployment.ts";
import { GetInstallationService } from "./getInstallation.ts";
import { GetOrgByIDService } from "./getOrgByID.ts";
import { GetSettingsService } from "./getSettings.ts";
import { GetTemplatesService } from "./getTemplates.ts";
import { GetUserService } from "./getUser.ts";
import { CreateGitHubAppInstallStateService } from "./githubAppInstall.ts";
import { GitHubInstallCallbackService } from "./githubInstallCallback.ts";
import { GitHubOAuthCallbackService } from "./githubOAuthCallback.ts";
import { GitHubWebhookService } from "./githubWebhook.ts";
import { ImportGitRepoService } from "./importGitRepo.ts";
import { IngestLogsService } from "./ingestLogs.ts";
import { InviteUserService } from "./inviteUser.ts";
import { IsNamespaceAvailableService } from "./isNamespaceAvailable.ts";
import { IsSubdomainAvailableService } from "./isSubdomainAvailable.ts";
import { ListChartsService } from "./listCharts.ts";
import { ListDeploymentsService } from "./listDeployments.ts";
import { ListOrgGroupsService } from "./listOrgGroups.ts";
import { ListOrgReposService } from "./listOrgRepos.ts";
import { ListRepoBranchesService } from "./listRepoBranches.ts";
import { ListRepoWorkflowsService } from "./listRepoWorkflows.ts";
import { RemoveUserFromOrgService } from "./removeUserFromOrg.ts";
import { RevokeInvitationService } from "./revokeInvitation.ts";
import { SetAppCDService } from "./setAppCD.ts";
import { UpdateAppService } from "./updateApp.ts";
import { UpdateDeploymentService } from "./updateDeployment.ts";

export const kubernetesClientService = new KubernetesClientService(db.user);

export const registryService = new RegistryService();

export const gitProviderFactoryService = new GitProviderFactoryService(
  db.org,
  db.repoImportState,
  kubernetesClientService,
);

export const ingressConfigService = new IngressConfigService(
  kubernetesClientService,
);

export const rancherService = new RancherService(kubernetesClientService);

export const serviceConfigService = new ServiceConfigService();

export const logCollectionService = new LogCollectionService(registryService);

export const statefulSetConfigService = new StatefulSetConfigService(
  logCollectionService,
);

export const deploymentConfigService = new DeploymentConfigService(
  db.app,
  gitProviderFactoryService,
  registryService,
  ingressConfigService,
  statefulSetConfigService,
);

export const clusterResourcesService = new ClusterResourcesService(
  gitProviderFactoryService,
  serviceConfigService,
  ingressConfigService,
  statefulSetConfigService,
  deploymentConfigService,
);

export const isNamespaceAvailableService = new IsNamespaceAvailableService(
  kubernetesClientService,
);

export const appService = new AppService(
  deploymentConfigService,
  isNamespaceAvailableService,
  gitProviderFactoryService,
  rancherService,
);

export const builderService = new BuilderService(
  db.org,
  db.app,
  db.deployment,
  gitProviderFactoryService,
  logCollectionService,
  deploymentConfigService,
  kubernetesClientService,
);

export const helmService = new HelmService(
  rancherService,
  logCollectionService,
  kubernetesClientService,
);

export const deploymentService = new DeploymentService(
  db.app,
  db.appGroup,
  db.deployment,
  helmService,
  gitProviderFactoryService,
  rancherService,
  builderService,
  clusterResourcesService,
  kubernetesClientService,
);

export const acceptInvitationService = new AcceptInvitationService(
  db.invitation,
);

export const claimOrgService = new ClaimOrgService(db.org);

export const createAppService = new CreateAppService(
  db.org,
  db.app,
  db.appGroup,
  db.user,
  appService,
  deploymentService,
  deploymentConfigService,
);

export const createAppGroupService = new CreateAppGroupService(
  db.org,
  db.app,
  db.appGroup,
  db.user,
  appService,
  deploymentService,
  deploymentConfigService,
);

export const createOrgService = new CreateOrgService(db.org);

export const deleteAppService = new DeleteAppService(
  db.org,
  db.app,
  db.appGroup,
  db.deployment,
  registryService,
  clusterResourcesService,
  kubernetesClientService,
);

export const deleteAppPodService = new DeleteAppPodService(
  db.app,
  kubernetesClientService,
);

export const deleteOrgByIDService = new DeleteOrgByIDService(
  db.org,
  db.app,
  deleteAppService,
);

export const fileBrowserService = new FileBrowserService(
  db.app,
  statefulSetConfigService,
  kubernetesClientService,
);

export const getAppByIDService = new GetAppByIDService(
  db.org,
  db.app,
  db.appGroup,
  db.deployment,
  deploymentConfigService,
  gitProviderFactoryService,
  kubernetesClientService,
);

export const getAppLogsService = new GetAppLogsService(
  db.app,
  db.subscribe.bind(db),
  kubernetesClientService,
);

export const getAppStatusService = new GetAppStatusService(db.app);

export const getDeploymentService = new GetDeploymentService(
  db.org,
  db.app,
  db.deployment,
  deploymentConfigService,
  gitProviderFactoryService,
  kubernetesClientService,
);

export const getInstallationService = new GetInstallationService(
  db.org,
  gitProviderFactoryService,
);

export const getOrgByIDService = new GetOrgByIDService(
  db.org,
  db.app,
  db.appGroup,
  db.invitation,
  gitProviderFactoryService,
);

export const getSettingsService = new GetSettingsService(rancherService);

export const getTemplatesService = new GetTemplatesService();

export const getUserService = new GetUserService(
  db.user,
  db.invitation,
  gitProviderFactoryService,
  rancherService,
);

export const createGitHubAppInstallStateService =
  new CreateGitHubAppInstallStateService(
    db.org,
    db.user,
    gitProviderFactoryService,
  );

export const githubInstallCallbackService = new GitHubInstallCallbackService(
  db.org,
  createGitHubAppInstallStateService,
);

export const gitHubOAuthCallbackService = new GitHubOAuthCallbackService(
  db.org,
  db.user,
  createGitHubAppInstallStateService,
);

export const githubWebhookService = new GitHubWebhookService(
  db.org,
  db.app,
  db.user,
  db.deployment,
  deploymentService,
  deploymentConfigService,
  gitProviderFactoryService,
);

export const importGitRepoService = new ImportGitRepoService(
  db.org,
  gitProviderFactoryService,
);

export const ingestLogsService = new IngestLogsService(db.deployment);

export const inviteUserService = new InviteUserService(db.user, db.invitation);

export const isSubdomainAvailableService = new IsSubdomainAvailableService(
  db.app,
  ingressConfigService,
);

export const listChartsService = new ListChartsService(
  registryService,
  helmService,
);

export const listDeploymentsService = new ListDeploymentsService(
  db.org,
  db.app,
  db.deployment,
  gitProviderFactoryService,
);

export const listOrgGroupsService = new ListOrgGroupsService(
  db.org,
  db.appGroup,
);

export const listOrgReposService = new ListOrgReposService(
  db.org,
  gitProviderFactoryService,
);

export const listRepoBranchesService = new ListRepoBranchesService(
  db.org,
  gitProviderFactoryService,
);

export const listRepoWorkflowsService = new ListRepoWorkflowsService(
  db.org,
  gitProviderFactoryService,
);

export const removeUserFromOrgService = new RemoveUserFromOrgService(db.org);

export const revokeInvitationService = new RevokeInvitationService(
  db.invitation,
);

export const setAppCDService = new SetAppCDService(db.app);

export const updateAppService = new UpdateAppService(
  db.org,
  db.user,
  db.app,
  db.appGroup,
  appService,
  deploymentService,
  deploymentConfigService,
);

export const updateDeploymentService = new UpdateDeploymentService(
  db.org,
  db.app,
  db.appGroup,
  db.deployment,
  gitProviderFactoryService,
  clusterResourcesService,
  rancherService,
  builderService,
  kubernetesClientService,
);
