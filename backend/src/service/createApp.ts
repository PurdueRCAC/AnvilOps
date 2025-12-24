import { randomBytes } from "node:crypto";
import { ConflictError, db } from "../db/index.ts";
import type { App, DeploymentConfigCreate } from "../db/models.ts";
import type { components } from "../generated/openapi.ts";
import { namespaceInUse } from "../lib/cluster/kubernetes.ts";
import { canManageProject, isRancherManaged } from "../lib/cluster/rancher.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import {
  getGitProvider,
  type GitProvider,
  type GitRepository,
} from "../lib/git/gitProvider.ts";
import {
  validateAppGroup,
  validateAppName,
  validateDeploymentConfig,
  validateSubdomain,
} from "../lib/validate.ts";
import {
  DeploymentError,
  InstallationNotFoundError,
  OrgNotFoundError,
  RepositoryNotFoundError,
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
    const subdomainRes = validateSubdomain(appData.subdomain);
    validateAppName(appData.name);
    await subdomainRes;
  } catch (e) {
    throw new ValidationError(e.message, e);
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
    let gitProvider: GitProvider, repo: GitRepository;

    try {
      gitProvider = await getGitProvider(organization.id);
      repo = await gitProvider.getRepoById(appData.repositoryId);
    } catch (err) {
      if (err instanceof InstallationNotFoundError) {
        throw new ValidationError(
          "This organization is not connected to a Git provider.",
        );
      } else if (err instanceof RepositoryNotFoundError) {
        throw new ValidationError("Invalid repository ID");
      }

      throw new Error("Failed to look up GitHub repository", err);
    }

    if (appData.event === "workflow_run" && appData.eventId) {
      try {
        const workflows = await gitProvider.getWorkflows(repo.id);
        if (!workflows.some((workflow) => workflow.id === appData.eventId)) {
          throw new ValidationError("Workflow not found");
        }
      } catch (err) {
        throw new Error("Failed to look up GitHub workflows", err);
      }
    }

    const latestCommit = await gitProvider.getLatestCommit(
      repo.id,
      appData.branch,
    );

    commitSha = latestCommit.sha;
    commitMessage = latestCommit.message;
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
