import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";
import { type Octokit } from "octokit";
import { type App } from "../generated/prisma/client.ts";
import { DeploymentSource } from "../generated/prisma/enums.ts";
import type {
  AppGroupCreateNestedOneWithoutAppsInput,
  DeploymentConfigCreateInput,
} from "../generated/prisma/models.ts";
import { type AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import {
  validateAppGroup,
  validateDeploymentConfig,
  validateRFC1123,
  validateSubdomain,
} from "../lib/validate.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { createState } from "./githubAppInstall.ts";
import {
  buildAndDeploy,
  generateCloneURLWithCredentials,
} from "./githubWebhook.ts";

export const createApp: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;

  {
    const validation = validateDeploymentConfig(appData);
    if (!validation.valid) {
      return json(400, res, { code: 400, message: validation.message });
    }

    const appGroupValidation = validateAppGroup(appData.appGroup);

    if (!appGroupValidation.valid) {
      return json(400, res, {
        code: 400,
        message: appGroupValidation.message,
      });
    }

    const subdomainValidation = await validateSubdomain(appData.subdomain);
    if (!subdomainValidation.valid) {
      return json(400, res, {
        code: 400,
        message: subdomainValidation.message,
      });
    }

    if (!validateRFC1123(appData.name)) {
      return json(400, res, {
        code: 400,
        message:
          "App name must contain only lowercase alphanumeric characters or '-', " +
          "start and end with an alphanumeric character, " +
          "and contain at most 63 characters.",
      });
    }
  }

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
    return json(401, res, {});
  }

  let commitSha = "unknown",
    commitMessage = "Initial deployment",
    cloneURL: string | undefined = undefined;

  if (appData.source === "git") {
    if (!organization.githubInstallationId) {
      const isOwner = !!(await db.organizationMembership.findFirst({
        where: {
          userId: req.user.id,
          organizationId: appData.orgId,
          permissionLevel: "OWNER",
        },
      }));
      if (isOwner) {
        const state = await createState(req.user.id, appData.orgId);
        return redirect(
          302,
          res,
          `${process.env.GITHUB_BASE_URL}/github-apps/${process.env.GITHUB_APP_NAME}/installations/new?state=${state}`,
        );
      } else {
        return json(403, res, {
          code: 403,
          message: "Owner needs to install GitHub App in organization.",
        });
      }
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
          return json(400, res, { code: 400, message: "Invalid workflow id" });
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
    cloneURL = await generateCloneURLWithCredentials(octokit, repo.html_url);
  }

  let app: App;

  const deploymentConfig: DeploymentConfigCreateInput = {
    env: appData.env,
    fieldValues: {
      replicas: 1,
      port: appData.port,
      servicePort: 80,
      mounts: appData.mounts,
      extra: {
        postStart: appData.postStart,
        preStop: appData.preStop,
      },
    },
    ...(appData.source === "git"
      ? {
          source: "GIT",
          repositoryId: appData.repositoryId,
          event: appData.event,
          eventId: appData.eventId,
          branch: appData.branch,
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
        logIngestSecret: randomBytes(48).toString("hex"),
        deploymentConfigTemplate: {
          create: deploymentConfig,
        },
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
      commitSha: commitSha,
      commitMessage: commitMessage,
      cloneURL: appData.source === "git" ? cloneURL : undefined,
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
