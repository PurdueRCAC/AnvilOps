import { type Request as ExpressRequest } from "express";
import { type HandlerMap } from "../types.ts";
import { acceptInvitationHandler } from "./acceptInvitation.ts";
import { claimOrgHandler } from "./claimOrg.ts";
import { createAppHandler } from "./createApp.ts";
import { createAppGroupHandler } from "./createAppGroup.ts";
import { createOrgHandler } from "./createOrg.ts";
import { deleteAppHandler } from "./deleteApp.ts";
import { deleteAppPodHandler } from "./deleteAppPod.ts";
import { deleteOrgByIDHandler } from "./deleteOrgByID.ts";
import {
  deleteAppFileHandler,
  downloadAppFileHandler,
  getAppFileHandler,
  writeAppFileHandler,
} from "./files.ts";
import { getAppByIDHandler } from "./getAppByID.ts";
import { getAppLogsHandler } from "./getAppLogs.ts";
import { getAppStatusHandler } from "./getAppStatus.ts";
import { getDeploymentHandler } from "./getDeployment.ts";
import { getInstallationHandler } from "./getInstallation.ts";
import { getOrgByIDHandler } from "./getOrgByID.ts";
import { getSettingsHandler } from "./getSettings.ts";
import { getTemplatesHandler } from "./getTemplates.ts";
import { getUserHandler } from "./getUser.ts";
import { githubAppInstallHandler } from "./githubAppInstall.ts";
import { githubInstallCallbackHandler } from "./githubInstallCallback.ts";
import { githubOAuthCallbackHandler } from "./githubOAuthCallback.ts";
import { githubWebhookHandler } from "./githubWebhook.ts";
import {
  importGitRepoContinueHandler,
  importGitRepoHandler,
} from "./importGitRepo.ts";
import { ingestLogsHandler } from "./ingestLogs.ts";
import { inviteUserHandler } from "./inviteUser.ts";
import { isNamespaceAvailableHandler } from "./isNamespaceAvailable.ts";
import { isSubdomainAvailableHandler } from "./isSubdomainAvailable.ts";
import { listChartsHandler } from "./listCharts.ts";
import { listDeploymentsHandler } from "./listDeployments.ts";
import { listOrgGroupsHandler } from "./listOrgGroups.ts";
import { listOrgReposHandler } from "./listOrgRepos.ts";
import { listRepoBranchesHandler } from "./listRepoBranches.ts";
import { listRepoWorkflowsHandler } from "./listRepoWorkflows.ts";
import { livenessProbe } from "./liveness.ts";
import { removeUserFromOrgHandler } from "./removeUserFromOrg.ts";
import { revokeInvitationHandler } from "./revokeInvitation.ts";
import { setAppCDHandler } from "./setAppCD.ts";
import { updateAppHandler } from "./updateApp.ts";
import { updateDeploymentHandler } from "./updateDeployment.ts";

export type AuthenticatedRequest = ExpressRequest & {
  user: {
    id: number;
    email?: string;
    name?: string;
  };
};

export const handlers = {
  acceptInvitation: acceptInvitationHandler,
  claimOrg: claimOrgHandler,
  createApp: createAppHandler,
  createAppGroup: createAppGroupHandler,
  createOrg: createOrgHandler,
  deleteApp: deleteAppHandler,
  deleteAppFile: deleteAppFileHandler,
  deleteAppPod: deleteAppPodHandler,
  deleteOrgByID: deleteOrgByIDHandler,
  downloadAppFile: downloadAppFileHandler,
  getAppByID: getAppByIDHandler,
  getAppFile: getAppFileHandler,
  getAppLogs: getAppLogsHandler,
  getAppStatus: getAppStatusHandler,
  getDeployment: getDeploymentHandler,
  getInstallation: getInstallationHandler,
  getOrgByID: getOrgByIDHandler,
  getSettings: getSettingsHandler,
  getTemplates: getTemplatesHandler,
  getUser: getUserHandler,
  githubAppInstall: githubAppInstallHandler,
  githubInstallCallback: githubInstallCallbackHandler,
  githubOAuthCallback: githubOAuthCallbackHandler,
  githubWebhook: githubWebhookHandler,
  importGitRepo: importGitRepoContinueHandler,
  importGitRepoCreateState: importGitRepoHandler,
  ingestLogs: ingestLogsHandler,
  inviteUser: inviteUserHandler,
  isSubdomainAvailable: isSubdomainAvailableHandler,
  isNamespaceAvailable: isNamespaceAvailableHandler,
  listCharts: listChartsHandler,
  listDeployments: listDeploymentsHandler,
  listOrgGroups: listOrgGroupsHandler,
  listOrgRepos: listOrgReposHandler,
  listRepoBranches: listRepoBranchesHandler,
  listRepoWorkflows: listRepoWorkflowsHandler,
  livenessProbe,
  removeUserFromOrg: removeUserFromOrgHandler,
  revokeInvitation: revokeInvitationHandler,
  setAppCD: setAppCDHandler,
  updateApp: updateAppHandler,
  updateDeployment: updateDeploymentHandler,
  writeAppFile: writeAppFileHandler,
} as const satisfies HandlerMap;
