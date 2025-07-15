import { type Octokit } from "octokit";
import { randomBytes } from "node:crypto";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import {
  validateDeploymentConfig,
  validateRFC1123,
  validateSubdomain,
} from "../lib/validate.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { createState } from "./githubAppInstall.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import type {
  DeploymentConfigCreateInput,
  MountConfigCreateNestedManyWithoutDeploymentConfigInput,
} from "../generated/prisma/models.ts";
import type { DeploymentConfig, App } from "../generated/prisma/client.ts";
import {
  buildAndDeploy,
  generateCloneURLWithCredentials,
} from "./githubWebhook.ts";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { MAX_GROUPNAME_LEN } from "../lib/kubernetes.ts";

const createAppGroup: HandlerMap["createAppGroup"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const data = ctx.request.requestBody;
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

  let octokit: Octokit;
  if (data.apps.some((app) => app.source === "git")) {
    if (!organization.githubInstallationId) {
      const isOwner = !!(await db.organizationMembership.findFirst({
        where: {
          userId: req.user.id,
          organizationId: data.orgId,
          permissionLevel: "OWNER",
        },
      }));
      if (isOwner) {
        const state = await createState(req.user.id, data.orgId);
        return redirect(
          302,
          res,
          `${process.env.GITHUB_BASE_URL}/github-apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${state}`,
        );
      } else {
        return json(403, res, {
          code: 403,
          message:
            "Owner needs to install GitHub App in organization in order to deploy from Git repositories",
        });
      }
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
    const deploymentConfig: DeploymentConfigCreateInput & {
      mounts: MountConfigCreateNestedManyWithoutDeploymentConfigInput;
    } = {
      port: app.port,
      env: app.env,
      mounts: { createMany: { data: app.mounts } },
      postStart: app.postStart,
      preStop: app.preStop,
      ...(app.source === "git"
        ? {
            source: "GIT",
            repositoryId: app.repositoryId,
            event: app.event,
            eventId: app.eventId,
            branch: app.branch,
            builder: app.builder,
            dockerfilePath: app.dockerfilePath,
            rootDir: app.rootDir,
          }
        : {
            source: "IMAGE",
            imageTag: app.imageTag,
          }),
    };

    return {
      name: app.name,
      displayName: app.name,
      subdomain: app.subdomain,
      org: {
        connect: {
          id: app.orgId,
        },
      },
      appGroup: {
        connect: {
          id: appGroupId,
        },
      },
      logIngestSecret: randomBytes(48).toString("hex"),
      deploymentConfigTemplate: {
        create: deploymentConfig,
      },
    };
  });

  let apps: (App & { deploymentConfigTemplate: DeploymentConfig })[];
  try {
    apps = await db.$transaction(
      appConfigs.map((app) =>
        db.app.create({
          data: app,
          include: { deploymentConfigTemplate: { include: { mounts: true } } },
        }),
      ),
    );

    apps = await db.$transaction(
      apps.map((app) =>
        db.app.update({
          where: { id: app.id },
          data: { imageRepo: `app-${app.orgId}-${app.id}` },
          include: { deploymentConfigTemplate: { include: { mounts: true } } },
        }),
      ),
    );
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
            commitMessage = "Initial deployment",
            cloneURL: string | undefined = undefined;

          if (app.deploymentConfigTemplate.source === "GIT") {
            const repo = await getRepoById(
              octokit,
              app.deploymentConfigTemplate.repositoryId,
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
            cloneURL = await generateCloneURLWithCredentials(
              octokit,
              repo.html_url,
            );
          }
          await buildAndDeploy({
            orgId: app.orgId,
            appId: app.id,
            imageRepo: app.imageRepo,
            commitSha: commitSha,
            commitMessage: commitMessage,
            cloneURL:
              app.deploymentConfigTemplate.source === "GIT"
                ? cloneURL
                : undefined,
            config: appConfigs[idx].deploymentConfigTemplate.create,
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
export default createAppGroup;
