import { randomBytes } from "node:crypto";
import { type Octokit } from "octokit";
import { type App } from "../generated/prisma/client.ts";
import { DeploymentSource } from "../generated/prisma/enums.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import type {
  AppGroupCreateNestedOneWithoutAppsInput,
  DeploymentConfigCreateInput,
} from "../generated/prisma/models.ts";
import { canManageProject, isRancherManaged } from "../lib/cluster/rancher.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  validateAppGroup,
  validateAppName,
  validateDeploymentConfig,
  validateSubdomain,
} from "../lib/validate.ts";
import { json, type HandlerMap } from "../types.ts";
import { buildAndDeploy } from "./githubWebhook.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const createApp: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;

  const organization = await db.organization.findUnique({
    where: {
      id: appData.orgId,
      users: {
        some: {
          userId: req.user.id,
        },
      },
    },
  });

  if (!organization) {
    return json(400, res, { code: 400, message: "Organization not found" });
  }

  try {
    await validateDeploymentConfig(appData);
    validateAppGroup(appData.appGroup);
    const subdomainRes = validateSubdomain(appData.subdomain);
    validateAppName(appData.name);
    await subdomainRes;
  } catch (e) {
    return json(400, res, {
      code: 400,
      message: e.message,
    });
  }

  let clusterUsername: string;
  if (isRancherManaged()) {
    if (!appData.projectId) {
      return json(400, res, { code: 400, message: "Project ID is required" });
    }

    let { clusterUsername: username } = await db.user.findUnique({
      where: { id: req.user.id },
      select: { clusterUsername: true },
    });
    if (!(await canManageProject(username, appData.projectId))) {
      return json(400, res, { code: 400, message: "Project not found" });
    }

    clusterUsername = username;
  }

  let commitSha = "unknown",
    commitMessage = "Initial deployment";

  if (appData.source === "git") {
    if (!organization.githubInstallationId) {
      return json(403, res, {
        code: 403,
        message:
          "The AnvilOps GitHub App is not installed in this organization.",
      });
    }

    let octokit: Octokit, repo: Awaited<ReturnType<typeof getRepoById>>;

    try {
      octokit = await getOctokit(organization.githubInstallationId);
      repo = await getRepoById(octokit, appData.repositoryId);
    } catch (err) {
      if (err.status === 404) {
        return json(400, res, { code: 400, message: "Invalid repository id" });
      }

      console.error(err);
      return json(500, res, {
        code: 500,
        message: "Failed to look up GitHub repository.",
      });
    }

    if (appData.event === "workflow_run" && appData.eventId) {
      try {
        const workflows = await octokit
          .request({
            method: "GET",
            url: `/repositories/${repo.id}/actions/workflows`,
          })
          .then((res) => res.data.workflows);
        if (!workflows.some((workflow) => workflow.id === appData.eventId)) {
          return json(400, res, { code: 400, message: "Workflow not found" });
        }
      } catch (err) {
        console.error(err);
        return json(500, res, {
          code: 500,
          message: "Failed to look up GitHub workflows.",
        });
      }
    }

    const latestCommit = (
      await octokit.rest.repos.listCommits({
        per_page: 1,
        owner: repo.owner.login,
        repo: repo.name,
      })
    ).data[0];

    commitSha = latestCommit.sha;
    commitMessage = latestCommit.commit.message;
  }

  let app: App;

  const cpu = Math.round(appData.cpuCores * 1000) + "m",
    memory = appData.memoryInMiB + "Mi";
  const deploymentConfig: DeploymentConfigCreateInput = {
    env: appData.env,
    fieldValues: {
      collectLogs: true,
      replicas: 1,
      port: appData.port,
      servicePort: 80,
      mounts: appData.mounts,
      extra: {
        postStart: appData.postStart,
        preStop: appData.preStop,
        requests: { cpu, memory, "nvidia.com/gpu": undefined },
        limits: { cpu, memory, "nvidia.com/gpu": undefined },
      },
    },
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
  let appGroup: AppGroupCreateNestedOneWithoutAppsInput;
  switch (appData.appGroup.type) {
    case "standalone":
      appGroup = {
        create: {
          name: `${appData.name}-${randomBytes(4).toString("hex")}`,
          org: { connect: { id: appData.orgId } },
          isMono: true,
        },
      };
      break;
    case "create-new":
      appGroup = {
        create: {
          name: appData.appGroup.name,
          org: { connect: { id: appData.orgId } },
        },
      };
      break;
    default:
      appGroup = {
        connect: {
          id: appData.appGroup.id,
        },
      };
      break;
  }
  try {
    app = await db.app.create({
      data: {
        name: appData.name,
        displayName: appData.name,
        subdomain: appData.subdomain,
        org: {
          connect: {
            id: appData.orgId,
          },
        },

        // This cluster username will be used to automatically update the app after a build job or webhook payload
        // TODO: make this a setting in the UI
        clusterUsername,
        projectId: appData.projectId,
        logIngestSecret: randomBytes(48).toString("hex"),
        appGroup,
      },
    });

    app = await db.app.update({
      where: { id: app.id },
      data: { imageRepo: `app-${appData.orgId}-${app.id}` },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
      const message =
        err.meta?.target === "subdomain"
          ? "Subdomain must be unique."
          : "App group already exists in organization.";
      return json(409, res, {
        code: 409,
        message,
      });
    }
    console.error(err);
    return json(500, res, { code: 500, message: "Unable to create app." });
  }

  try {
    await buildAndDeploy({
      orgId: appData.orgId,
      appId: app.id,
      imageRepo: app.imageRepo,
      commitMessage: commitMessage,
      config: deploymentConfig,
      createCheckRun: false,
    });
  } catch (e) {
    console.error(e);
    return json(500, res, {
      code: 500,
      message: "Failed to create a deployment for your app.",
    });
  }

  return json(200, res, { id: app.id });
};

export function convertSource(input: string) {
  switch (input) {
    case "git":
      return DeploymentSource.GIT;
    case "image":
      return DeploymentSource.IMAGE;
    default:
      return null;
  }
}
