import { PgDatabase, type Database } from "../db/index.ts";
import { env, parseCsv } from "../lib/env.ts";
import { AcceptInvitationService } from "./acceptInvitation.ts";
import { AddDomainService } from "./addDomain.ts";
import { AuthService } from "./auth.ts";
import { CertGenerationService } from "./certGeneration.ts";
import { ClaimOrgService } from "./claimOrg.ts";
import { AppService } from "./common/app.ts";
import { BuilderService } from "./common/builder.ts";
import { KVCacheService } from "./common/cache.ts";
import { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { RancherService } from "./common/cluster/rancher.ts";
import { RancherAccessService } from "./common/cluster/rancherAccess.ts";
import { ClusterResourcesService } from "./common/cluster/resources.ts";
import { IngressConfigService } from "./common/cluster/resources/ingress.ts";
import { LogCollectionService } from "./common/cluster/resources/logs.ts";
import { ServiceConfigService } from "./common/cluster/resources/service.ts";
import { StatefulSetConfigService } from "./common/cluster/resources/statefulset.ts";
import { DeploymentService } from "./common/deployment.ts";
import { DeploymentConfigService } from "./common/deploymentConfig.ts";
import { GitHubUserService } from "./common/git/githubUser.ts";
import { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { HelmService } from "./common/helm.ts";
import { RegistryService } from "./common/registry.ts";
import { CreateAppService } from "./createApp.ts";
import { CreateAppGroupService } from "./createAppGroup.ts";
import { CreateOrgService } from "./createOrg.ts";
import { CustomDomainService } from "./customDomain.ts";
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
import { ListDomainsService } from "./listDomains.ts";
import { ListOrgGroupsService } from "./listOrgGroups.ts";
import { ListOrgReposService } from "./listOrgRepos.ts";
import { ListRepoBranchesService } from "./listRepoBranches.ts";
import { ListRepoWorkflowsService } from "./listRepoWorkflows.ts";
import { RemoveUserFromOrgService } from "./removeUserFromOrg.ts";
import { RetryCertGenService } from "./retryCertGen.ts";
import { RevokeInvitationService } from "./revokeInvitation.ts";
import { SetAppCDService } from "./setAppCD.ts";
import { UpdateAppService } from "./updateApp.ts";
import { UpdateDeploymentService } from "./updateDeployment.ts";
import { VerifyDomainService } from "./verifyDomain.ts";

export const db: Database = new PgDatabase(
  env.DATABASE_URL ??
    `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@${env.POSTGRES_HOSTNAME}/${env.POSTGRES_DB}`,
  Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64"),
);

export const cacheService = new KVCacheService(db.cache);

export const rancherService = new RancherService(
  env.RANCHER_TOKEN,
  env.RANCHER_BASE_URL,
  env.LOGIN_TYPE,
  env.SANDBOX_ID,
);

export const kubernetesClientService = new KubernetesClientService(
  db.user,
  rancherService,
  env.CURRENT_NAMESPACE,
);

export const rancherAccessService = new RancherAccessService(
  kubernetesClientService,
  rancherService,
  cacheService,
  env.SANDBOX_ID,
);

export const registryService = new RegistryService(
  env.REGISTRY_HOSTNAME,
  env.REGISTRY_PROTOCOL,
  env.IMAGE_PULL_USERNAME,
  env.IMAGE_PULL_PASSWORD,
  env.DELETE_REPO_USERNAME,
  env.DELETE_REPO_PASSWORD,
  env.HARBOR_PROJECT_NAME,
  !!env.IN_TILT,
);

export const githubUserService = new GitHubUserService(
  env.GITHUB_API_URL,
  env.GITHUB_CLIENT_ID,
  env.GITHUB_CLIENT_SECRET,
);

export const gitProviderFactoryService = new GitProviderFactoryService(
  db.org,
  db.repoImportState,
  kubernetesClientService,
  cacheService,
  githubUserService,
  Buffer.from(env.GITHUB_PRIVATE_KEY, "base64").toString("utf-8"),
  env.BASE_URL,
  env.GITHUB_API_URL,
  env.GITHUB_BASE_URL,
  env.GITHUB_APP_ID,
  env.GITHUB_CLIENT_ID,
  env.GITHUB_APP_NAME,
);

export const ingressConfigService = new IngressConfigService(
  kubernetesClientService,
  env.APP_DOMAIN,
  env.INGRESS_CLASS_NAME,
  env.CURRENT_NAMESPACE,
);

export const authService = new AuthService(
  db.user,
  rancherService,
  env.USE_RANCHER_OIDC === "true",
  env.BASE_URL,
  env.RANCHER_BASE_URL,
  parseCsv(env.ALLOWED_IDPS) ?? [],
  env.CLIENT_ID,
  env.CLIENT_SECRET,
  env.LOGIN_CLAIM,
);

export const serviceConfigService = new ServiceConfigService(
  env.CLUSTER_INTERNAL_BASE_URL,
);

export const logCollectionService = new LogCollectionService(
  registryService,
  env.LOG_SHIPPER_IMAGE,
  env.CLUSTER_INTERNAL_BASE_URL,
);

export const statefulSetConfigService = new StatefulSetConfigService(
  logCollectionService,
  env.STORAGE_CLASS_NAME,
  env.STORAGE_ACCESS_MODES.split(","),
);

export const deploymentConfigService = new DeploymentConfigService(
  db.app,
  gitProviderFactoryService,
  registryService,
  ingressConfigService,
  statefulSetConfigService,
  env.APP_DOMAIN,
  env.REGISTRY_HOSTNAME,
  env.HARBOR_PROJECT_NAME,
);

export const clusterResourcesService = new ClusterResourcesService(
  gitProviderFactoryService,
  serviceConfigService,
  ingressConfigService,
  statefulSetConfigService,
  deploymentConfigService,
  !!env.CREATE_INGRESS_NETPOL,
  JSON.parse(env.ALLOW_INGRESS_FROM) as {
    [key: string]: string;
  }[],
  env.REGISTRY_HOSTNAME,
  env.IMAGE_PULL_USERNAME,
  env.IMAGE_PULL_PASSWORD,
);

export const isNamespaceAvailableService = new IsNamespaceAvailableService(
  kubernetesClientService,
);

export const appService = new AppService(
  deploymentConfigService,
  isNamespaceAvailableService,
  gitProviderFactoryService,
  rancherService,
  rancherAccessService,
  !!env.ALLOW_HELM_DEPLOYMENTS,
);

export const builderService = new BuilderService(
  db.org,
  db.app,
  db.deployment,
  gitProviderFactoryService,
  logCollectionService,
  deploymentConfigService,
  kubernetesClientService,
  env.CURRENT_NAMESPACE,
  env.DOCKERFILE_BUILDER_IMAGE,
  env.RAILPACK_BUILDER_IMAGE,
  env.REGISTRY_HOSTNAME,
  env.HARBOR_PROJECT_NAME,
  env.CLUSTER_INTERNAL_BASE_URL,
  env.BUILDKITD_ADDRESS,
  env.RAILPACK_INTERNAL_FRONTEND_IMAGE,
  env.RAILPACK_INTERNAL_BUILDER_IMAGE,
  env.RAILPACK_INTERNAL_RUNTIME_IMAGE,
);

export const helmService = new HelmService(
  logCollectionService,
  kubernetesClientService,
  rancherService,
  `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}`,
  env.CHART_PROJECT_NAME,
  env.CURRENT_NAMESPACE,
  env.HELM_DEPLOYER_IMAGE,
  env.CLUSTER_INTERNAL_BASE_URL,
);

export const deploymentService = new DeploymentService(
  db.org,
  db.app,
  db.appGroup,
  db.deployment,
  db.domain,
  helmService,
  gitProviderFactoryService,
  builderService,
  clusterResourcesService,
  kubernetesClientService,
  env.BASE_URL,
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
  db.domain,
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
  env.FILE_BROWSER_IMAGE,
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

export const getAppStatusService = new GetAppStatusService(
  db.app,
  kubernetesClientService,
);

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
  env.APP_DOMAIN,
);

export const getSettingsService = new GetSettingsService(
  rancherService,
  env["NODE_ENV"] === "development"
    ? "./cluster.local.json"
    : env.CLUSTER_CONFIG_PATH,
  env.INGRESS_CLASS_NAME ? env.APP_DOMAIN : undefined,
  env.STORAGE_CLASS_NAME,
  env.ALLOW_HELM_DEPLOYMENTS === "true",
  env.ANVILOPS_VERSION,
  env.BUILD_DATE,
  !!env.IN_TILT,
);

export const getTemplatesService = new GetTemplatesService(
  env.NODE_ENV === "development"
    ? "../templates/templates.json"
    : "./templates.json",
);

export const getUserService = new GetUserService(
  db.user,
  db.invitation,
  gitProviderFactoryService,
  rancherService,
  rancherAccessService,
);

export const createGitHubAppInstallStateService =
  new CreateGitHubAppInstallStateService(
    db.org,
    db.user,
    gitProviderFactoryService,
    env.GITHUB_BASE_URL,
    env.GITHUB_APP_NAME,
  );

export const githubInstallCallbackService = new GitHubInstallCallbackService(
  db.org,
  createGitHubAppInstallStateService,
  env.GITHUB_BASE_URL,
  env.GITHUB_CLIENT_ID,
);

export const gitHubOAuthCallbackService = new GitHubOAuthCallbackService(
  db.org,
  db.user,
  createGitHubAppInstallStateService,
  githubUserService,
);

export const githubWebhookService = new GitHubWebhookService(
  db.org,
  db.app,
  db.user,
  db.deployment,
  deploymentService,
  deploymentConfigService,
  gitProviderFactoryService,
  env.GITHUB_APP_ID,
  env.GITHUB_WEBHOOK_SECRET,
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
  cacheService,
  !!env.ALLOW_HELM_DEPLOYMENTS,
  env.REGISTRY_HOSTNAME,
  env.CHART_PROJECT_NAME,
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
  deploymentService,
);

export const certGenerationService = new CertGenerationService(
  cacheService,
  db.app,
  db.domain,
  ingressConfigService,
  kubernetesClientService,
  env.ACME_SERVER_ADDRESS,
);

export const customDomainService = new CustomDomainService(
  db.domain,
  env.CNAME_DOMAIN,
);

export const listDomainsService = new ListDomainsService(
  db.domain,
  customDomainService,
);

export const addDomainService = new AddDomainService(
  db.domain,
  customDomainService,
);

export const verifyDomainService = new VerifyDomainService(
  db.app,
  db.domain,
  customDomainService,
  certGenerationService,
  ingressConfigService,
  kubernetesClientService,
);

export const retryCertGenService = new RetryCertGenService(
  certGenerationService,
  db.domain,
);
