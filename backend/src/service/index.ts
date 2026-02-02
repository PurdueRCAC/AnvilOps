import { db } from "../db/index.ts";
import { AcceptInvitationService } from "./acceptInvitation.ts";
import { ClaimOrgService } from "./claimOrg.ts";
import { AppService } from "./common/app.ts";
import { DeploymentService } from "./common/deployment.ts";
import { DeploymentConfigService } from "./common/deploymentConfig.ts";
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
import { SetAppCDService } from "./setAppCD.ts";
import { UpdateAppService } from "./updateApp.ts";
import { UpdateDeploymentService } from "./updateDeployment.ts";

export const deploymentConfigService = new DeploymentConfigService(db.app);

export const isNamespaceAvailableService = new IsNamespaceAvailableService();

export const appService = new AppService(
  deploymentConfigService,
  isNamespaceAvailableService,
);

export const deploymentService = new DeploymentService(
  db.app,
  db.appGroup,
  db.deployment,
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
);

export const deleteAppPodService = new DeleteAppPodService(db.app);

export const deleteOrgByIDService = new DeleteOrgByIDService(
  db.org,
  db.app,
  deleteAppService,
);

export const fileBrowserService = new FileBrowserService(db.app);

export const getAppByIDService = new GetAppByIDService(
  db.org,
  db.app,
  db.appGroup,
  db.deployment,
  deploymentConfigService,
);

export const getAppLogsService = new GetAppLogsService(
  db.app,
  db.subscribe.bind(db),
);

export const getAppStatusService = new GetAppStatusService(db.app);

export const getDeploymentService = new GetDeploymentService(
  db.org,
  db.app,
  db.deployment,
  deploymentConfigService,
);

export const getInstallationService = new GetInstallationService(db.org);

export const getOrgByIDService = new GetOrgByIDService(
  db.org,
  db.app,
  db.appGroup,
  db.invitation,
);

export const getSettingsService = new GetSettingsService();

export const getTemplatesService = new GetTemplatesService();

export const getUserService = new GetUserService(db.user, db.invitation);

export const createGitHubAppInstallStateService =
  new CreateGitHubAppInstallStateService(db.org, db.user);

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
);

export const importGitRepoService = new ImportGitRepoService(db.org);

export const ingestLogsService = new IngestLogsService(db.deployment);

export const inviteUserService = new InviteUserService(db.user, db.invitation);

export const isSubdomainAvailableService = new IsSubdomainAvailableService(
  db.app,
);

export const listChartsService = new ListChartsService();

export const listDeploymentsService = new ListDeploymentsService(
  db.org,
  db.app,
  db.deployment,
);

export const listOrgGroupsService = new ListOrgGroupsService(
  db.org,
  db.appGroup,
);

export const listOrgReposService = new ListOrgReposService(db.org);

export const listRepoBranchesService = new ListRepoBranchesService(db.org);

export const listRepoWorkflowsService = new ListRepoWorkflowsService(db.org);

export const removeUserFromOrgService = new RemoveUserFromOrgService(db.org);

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
);
