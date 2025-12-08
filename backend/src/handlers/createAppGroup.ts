import { randomBytes } from "node:crypto";
import { type Octokit } from "octokit";
import type { App } from "../generated/prisma/client.ts";
import { PrismaClientKnownRequestError } from "../generated/prisma/internal/prismaNamespace.ts";
import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { canManageProject } from "../lib/cluster/rancher.ts";
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
import type { AuthenticatedRequest } from "./index.ts";

export const createAppGroup: HandlerMap["createAppGroup"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const data = ctx.request.requestBody;

  const organization = await db.organization.findUnique({
    where: {
      id: data.orgId,
      users: {
        some: {
          userId: req.user.id,
        },
      },
    },
    include: {
      appGroups: {
        where: {
          name: data.name,
        },
      },
    },
  });

  if (!organization) {
    return json(400, res, { code: 400, message: "Organization not found" });
  }

  if (organization.appGroups.length != 0) {
    return json(400, res, {
      code: 400,
      message: `App group ${data.name} already exists`,
    });
  }

  try {
    validateAppGroup({ type: "create-new", name: data.name });
  } catch (e) {
    return json(400, res, { code: 400, message: e.message });
  }
  const appValidationErrors = (
    await Promise.all(
      data.apps.map(async (app) => {
        try {
          const subdomainRes = validateSubdomain(app.subdomain);
          await validateDeploymentConfig({
            ...app,
            createIngress: !!app.subdomain,
            collectLogs: true,
          });
          validateAppName(app.name);
          await subdomainRes;
          return null;
        } catch (e) {
          return e;
        }
      }),
    )
  ).filter(Boolean);
  if (appValidationErrors.length > 0) {
    return json(400, res, {
      code: 400,
      message: JSON.stringify(appValidationErrors),
    });
  }

  const { clusterUsername } = await db.user.findUnique({
    where: { id: req.user.id },
  });

  const permissionResults = await Promise.all(
    data.apps.map(async (app) => ({
      project: app.projectId,
      canManage: await canManageProject(clusterUsername, app.projectId),
    })),
  );

  for (const result of permissionResults) {
    if (!result.canManage) {
      return json(400, res, {
        code: 400,
        message: `Project ${result.project} not found`,
      });
    }
  }

  let octokit: Octokit;
  if (data.apps.some((app) => app.source === "git")) {
    if (!organization.githubInstallationId) {
      return json(403, res, {
        code: 403,
        message:
          "The AnvilOps GitHub App is not installed in this organization.",
      });
    } else {
      octokit = await getOctokit(organization.githubInstallationId);
    }

    for (const app of data.apps) {
      if (app.source !== "git") continue;

      try {
        await getRepoById(octokit, app.repositoryId);
      } catch (err) {
        if (err.status === 404) {
          return json(400, res, {
            code: 400,
            message: `Invalid repository id ${app.repositoryId} for app ${app.name}`,
          });
        }

        console.error(err);
        return json(500, res, {
          code: 500,
          message: `Failed to look up repository for app ${app.name}`,
        });
      }

      if (app.event === "workflow_run") {
        try {
          const workflows = await octokit
            .request({
              method: "GET",
              url: `/repositories/${app.repositoryId}/actions/workflows`,
            })
            .then((res) => res.data.workflows);
          if (!workflows.some((workflow) => workflow.id == app.eventId)) {
            return json(400, res, {
              code: 400,
              message: `Invalid workflow id ${app.eventId} for app ${app.name}`,
            });
          }
        } catch (err) {
          console.error(err);
          return json(500, res, {
            code: 500,
            message: `Failed to look up workflow for app ${app.name}`,
          });
        }
      }
    }
  }

  const { id: appGroupId } = await db.appGroup.create({
    data: {
      name: data.name,
      orgId: data.orgId,
    },
  });
  const appConfigs = data.apps.map((app) => {
    return {
      name: app.name,
      displayName: app.name,
      namespace: app.subdomain,
      orgId: app.orgId,
      // This cluster username will be used to automatically update the app after a build job or webhook payload
      clusterUsername,
      projectId: app.projectId,
      appGroupId,
      logIngestSecret: randomBytes(48).toString("hex"),
    };
  });

  let apps: App[];
  try {
    apps = await db.$transaction(async (tx) => {
      return await tx.app.createManyAndReturn({
        data: appConfigs,
      });
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
    await Promise.all(
      apps.map((app, idx) =>
        (async () => {
          let commitSha = "unknown",
            commitMessage = "Initial deployment";

          const configParams = data.apps[idx];
          const cpu = Math.round(configParams.cpuCores * 1000) + "m",
            memory = configParams.memoryInMiB + "Mi";
          if (configParams.source === "git") {
            const repo = await getRepoById(octokit, configParams.repositoryId);
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

          const deploymentConfig: DeploymentConfigCreateInput = {
            collectLogs: true,
            createIngress: configParams.createIngress,
            subdomain: configParams.subdomain,
            env: configParams.env,
            requests: { cpu, memory },
            limits: { cpu, memory },
            replicas: 1,
            port: configParams.port,
            mounts: configParams.mounts,
            ...(configParams.source === "git"
              ? {
                  source: "GIT",
                  repositoryId: configParams.repositoryId,
                  event: configParams.event,
                  eventId: configParams.eventId,
                  branch: configParams.branch,
                  commitHash: commitSha,
                  builder: configParams.builder,
                  dockerfilePath: configParams.dockerfilePath,
                  rootDir: configParams.rootDir,
                }
              : {
                  source: "IMAGE",
                  imageTag: configParams.imageTag,
                }),
          };

          await buildAndDeploy({
            orgId: app.orgId,
            appId: app.id,
            imageRepo: app.imageRepo,
            commitMessage: commitMessage,
            config: deploymentConfig,
            createCheckRun: false,
          });
        })(),
      ),
    );
  } catch (err) {
    console.error(err);
    return json(500, res, {
      code: 500,
      message: "Failed to create deployments for your apps.",
    });
  }

  return json(200, res, {});
};
