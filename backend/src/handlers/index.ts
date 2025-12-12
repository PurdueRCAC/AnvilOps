import { type Request as ExpressRequest } from "express";
import { type HandlerMap } from "../types.ts";
import { acceptInvitation } from "./acceptInvitation.ts";
import { claimOrg } from "./claimOrg.ts";
import { createApp } from "./createApp.ts";
import { createAppGroup } from "./createAppGroup.ts";
import { createOrg } from "./createOrg.ts";
import { deleteApp } from "./deleteApp.ts";
import { deleteAppPod } from "./deleteAppPod.ts";
import { deleteOrgByID } from "./deleteOrgByID.ts";
import {
  deleteAppFile,
  downloadAppFile,
  getAppFile,
  writeAppFile,
} from "./files.ts";
import { getAppByID } from "./getAppByID.ts";
import { getAppLogs } from "./getAppLogs.ts";
import { getAppStatus } from "./getAppStatus.ts";
import { getDeployment } from "./getDeployment.ts";
import { getInstallation } from "./getInstallation.ts";
import { getOrgByID } from "./getOrgByID.ts";
import { getSettings } from "./getSettings.ts";
import { getTemplates } from "./getTemplates.ts";
import { getUser } from "./getUser.ts";
import { githubAppInstall } from "./githubAppInstall.ts";
import { githubInstallCallback } from "./githubInstallCallback.ts";
import { githubOAuthCallback } from "./githubOAuthCallback.ts";
import { githubWebhook } from "./githubWebhook.ts";
import { importGitRepo, importGitRepoCreateState } from "./importGitRepo.ts";
import { ingestLogs } from "./ingestLogs.ts";
import { inviteUser } from "./inviteUser.ts";
import { isSubdomainAvailable } from "./isSubdomainAvailable.ts";
import { listDeployments } from "./listDeployments.ts";
import { listOrgGroups } from "./listOrgGroups.ts";
import { listOrgRepos } from "./listOrgRepos.ts";
import { listRepoBranches } from "./listRepoBranches.ts";
import { listRepoWorkflows } from "./listRepoWorkflows.ts";
import { livenessProbe } from "./liveness.ts";
import { removeUserFromOrg } from "./removeUserFromOrg.ts";
import { revokeInvitation } from "./revokeInvitation.ts";
import { setAppCD } from "./setAppCD.ts";
import { updateApp } from "./updateApp.ts";
import { updateDeployment } from "./updateDeployment.ts";

export type AuthenticatedRequest = ExpressRequest & {
  user: {
    id: number;
    email?: string;
    name?: string;
  };
};

export const handlers = {
  acceptInvitation,
  claimOrg,
  createApp,
  createAppGroup,
  createOrg,
  deleteApp,
  deleteAppFile,
  deleteAppPod,
  deleteOrgByID,
  downloadAppFile,
  getAppByID,
  getAppFile,
  getAppLogs,
  getAppStatus,
  getDeployment,
  getInstallation,
  getOrgByID,
  getSettings,
  getTemplates,
  getUser,
  githubAppInstall,
  githubInstallCallback,
  githubOAuthCallback,
  githubWebhook,
  importGitRepo,
  importGitRepoCreateState,
  ingestLogs,
  inviteUser,
  isSubdomainAvailable,
  listDeployments,
  listOrgGroups,
  listOrgRepos,
  listRepoBranches,
  listRepoWorkflows,
  livenessProbe,
  removeUserFromOrg,
  revokeInvitation,
  setAppCD,
  updateApp,
  updateDeployment,
  writeAppFile,
} as const satisfies HandlerMap;
