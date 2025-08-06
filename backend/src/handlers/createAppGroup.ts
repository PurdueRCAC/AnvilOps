import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";
import { type Octokit } from "octokit";
import type { App, DeploymentConfig } from "../generated/prisma/client.ts";
import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { canManageProject } from "../lib/cluster/rancher.ts";
import { MAX_GROUPNAME_LEN } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  validateDeploymentConfig,
  validateRFC1123,
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

  // TODO: validate project id

  {
    const groupNameIsValid =
      data.name.length <= MAX_GROUPNAME_LEN &&
      data.name.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/);
    if (!groupNameIsValid) {
      return json(400, res, {
        code: 400,
        message: "Invalid group name",
      });
    }

    const appValidationErrors = data.apps
      .map((app) => validateDeploymentConfig(app))
      .filter((validation) => !validation.valid)
      .map((validation) => validation.message);
    if (appValidationErrors.length > 0) {
      return json(400, res, {
        code: 400,
        message: JSON.stringify(appValidationErrors),
      });
    }

    const subdomainErrors = (
      await Promise.all(
        data.apps.map((app) => validateSubdomain(app.subdomain)),
      )
    )
      .filter((validation) => !validation.valid)
      .map((validation) => validation.message);
    if (subdomainErrors.length > 0) {
      return json(400, res, {
        code: 400,
        message: JSON.stringify(subdomainErrors),
      });
    }

    for (const app of data.apps) {
      if (!validateRFC1123(app.name)) {
        return json(400, res, {
          code: 400,
          message:
            "App name must contain only lowercase alphanumeric characters or '-', " +
            "start and end with an alphanumeric character, " +
            "and contain at most 63 characters.",
        });
      }
    }
  }

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
    return json(401, res, {});
  }

  if (organization.appGroups.length != 0) {
    return json(400, res, {
      code: 400,
      message: `App group ${data.name} already exists`,
    });
  }

  const { clusterUsername } = await db.user.findUnique({
    where: { id: req.user.id },
  });

  const permissionResults = await Promise.all(
    data.apps.map((app) => canManageProject(clusterUsername, app.projectId)),
  );

  if (
    !permissionResults.reduce(
      (canManageAll, canManageCur) => canManageAll && canManageCur,
      true,
    )
  ) {
    return json(401, res, {});
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
      subdomain: app.subdomain,
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
          const deploymentConfig: DeploymentConfigCreateInput = {
            env: configParams.env,
            fieldValues: {
              replicas: 1,
              port: configParams.port,
              servicePort: 80,
              mounts: configParams.mounts,
              extra: {
                postStart: configParams.postStart,
                preStop: configParams.preStop,
              },
            },
            ...(configParams.source === "git"
              ? {
                  source: "GIT",
                  repositoryId: configParams.repositoryId,
                  event: configParams.event,
                  eventId: configParams.eventId,
                  branch: configParams.branch,
                  builder: configParams.builder,
                  dockerfilePath: configParams.dockerfilePath,
                  rootDir: configParams.rootDir,
                }
              : {
                  source: "IMAGE",
                  imageTag: configParams.imageTag,
                }),
          };
          if (deploymentConfig.source === "GIT") {
            const repo = await getRepoById(
              octokit,
              deploymentConfig.repositoryId,
            );
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
          await buildAndDeploy({
            orgId: app.orgId,
            appId: app.id,
            imageRepo: app.imageRepo,
            commitSha: commitSha,
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
