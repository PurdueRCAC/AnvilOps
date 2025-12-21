import { randomBytes } from "node:crypto";
import { type Octokit } from "octokit";
import { ConflictError, db } from "../db/index.ts";
import type { App, DeploymentConfigCreate } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { namespaceInUse } from "../lib/cluster/kubernetes.ts";
import { canManageProject, isRancherManaged } from "../lib/cluster/rancher.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { getLatestCommit, getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  validateAppGroup,
  validateAppName,
  validateDeploymentConfig,
} from "../lib/validate.ts";
import {
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "./common/errors.ts";
import { buildAndDeploy } from "./githubWebhook.ts";

export type NewApp = components["schemas"]["NewApp"];

export async function validateAppConfig(ownerUserId: number, appData: NewApp) {
  const organization = await db.org.getById(appData.orgId, {
    requireUser: { id: ownerUserId },
  });

  if (!organization) {
    throw new OrgNotFoundError(null);
  }

  try {
    await validateDeploymentConfig({ ...appData, collectLogs: true });
    validateAppGroup(appData.appGroup);
    validateAppName(appData.name);
  } catch (e) {
    throw new ValidationError(e.message, { cause: e });
  }

  let clusterUsername: string;
  if (isRancherManaged()) {
    if (!appData.projectId) {
      throw new ValidationError("Project ID is required");
    }

    let { clusterUsername: username } = await db.user.getById(ownerUserId);
    if (!(await canManageProject(username, appData.projectId))) {
      throw new ValidationError("Project not found");
    }

    clusterUsername = username;
  }

  let commitSha = "unknown",
    commitMessage = "Initial deployment";

  if (appData.source === "git") {
    if (!organization.githubInstallationId) {
      throw new ValidationError(
        "The AnvilOps GitHub App is not installed in this organization.",
      );
    }

    let octokit: Octokit, repo: Awaited<ReturnType<typeof getRepoById>>;

    try {
      octokit = await getOctokit(organization.githubInstallationId);
      repo = await getRepoById(octokit, appData.repositoryId);
    } catch (err) {
      if (err.status === 404) {
        throw new ValidationError("Invalid repository ID", { cause: err });
      }

      throw new Error("Failed to look up GitHub repository", { cause: err });
    }

    if (appData.event === "workflow_run" && appData.eventId) {
      try {
        const workflows = await (
          octokit.request({
            method: "GET",
            url: `/repositories/${repo.id}/actions/workflows`,
          }) as ReturnType<typeof octokit.rest.actions.listRepoWorkflows>
        ).then((res) => res.data.workflows);
        if (!workflows.some((workflow) => workflow.id === appData.eventId)) {
          throw new ValidationError("Workflow not found");
        }
      } catch (err) {
        throw new Error("Failed to look up GitHub workflows", { cause: err });
      }
    }

    const latestCommit = await getLatestCommit(
      octokit,
      repo.owner.login,
      repo.name,
    );

    commitSha = latestCommit.sha;
    commitMessage = latestCommit.commit.message;
  }

  return { clusterUsername, organization, commitSha, commitMessage };
}

export async function createApp(
  appData: NewApp,
  validationResult: Awaited<ReturnType<typeof validateAppConfig>>,
) {
  const { clusterUsername, organization, commitSha, commitMessage } =
    validationResult;

  let app: App;

  const cpu = Math.round(appData.cpuCores * 1000) + "m",
    memory = appData.memoryInMiB + "Mi";
  const deploymentConfig: DeploymentConfigCreate = {
    collectLogs: true,
    createIngress: appData.createIngress,
    subdomain: appData.subdomain,
    env: appData.env,
    requests: { cpu, memory },
    limits: { cpu, memory },
    replicas: 1,
    port: appData.port,
    mounts: appData.mounts,
    ...(appData.source === "git"
      ? {
          source: "GIT",
          repositoryId: appData.repositoryId,
          event: appData.event,
          eventId: appData.eventId,
          branch: appData.branch,
          commitHash: commitSha,
          builder: appData.builder,
          dockerfilePath: appData.dockerfilePath,
          rootDir: appData.rootDir,
        }
      : {
          source: "IMAGE",
          imageTag: appData.imageTag,
        }),
  };
  let appGroupId: number;
  switch (appData.appGroup.type) {
    case "standalone":
      appGroupId = await db.appGroup.create(
        appData.orgId,
        `${appData.name}-${randomBytes(4).toString("hex")}`,
        true,
      );
      break;
    case "create-new":
      appGroupId = await db.appGroup.create(
        appData.orgId,
        appData.appGroup.name,
        false,
      );
      break;
    default:
      appGroupId = appData.appGroup.id;
      break;
  }

  let namespace = appData.subdomain;
  if (await namespaceInUse(getNamespace(namespace))) {
    namespace += "-" + Math.floor(Math.random() * 10_000);
  }

  try {
    app = await db.app.create({
      orgId: appData.orgId,
      appGroupId: appGroupId,
      name: appData.name,
      clusterUsername: clusterUsername,
      projectId: appData.projectId,
      namespace: namespace,
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      throw new ValidationError(
        "App group name conflicts with an existing app group.",
      );
    }
    throw err;
  }

  try {
    await buildAndDeploy({
      org: organization,
      app,
      imageRepo: app.imageRepo,
      commitMessage: commitMessage,
      config: deploymentConfig,
      createCheckRun: false,
    });
  } catch (err) {
    throw new DeploymentError(err);
  }

  return app.id;
}
