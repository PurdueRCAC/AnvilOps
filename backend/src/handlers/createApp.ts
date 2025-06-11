import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Octokit } from "octokit";
import { type App } from "../generated/prisma/client.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, redirect, type HandlerMap } from "../types.ts";
import { createState } from "./githubAppInstall.ts";
import { createDeployment } from "./githubWebhook.ts";

const createApp: HandlerMap["createApp"] = async (
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
    return json(401, res, {});
  }

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
    return json(500, res, {
      code: 500,
      message: "Failed to look up GitHub repository.",
    });
  }

  const latestCommit = (
    await octokit.rest.repos.listCommits({
      per_page: 1,
      owner: repo.owner.login,
      repo: repo.name,
    })
  ).data[0];

  let app: App;
  try {
    app = await db.app.create({
      data: {
        name: appData.name,
        repositoryId: appData.repositoryId,
        port: appData.port,
        dockerfilePath: appData.dockerfilePath,
        subdomain: appData.subdomain,
        org: {
          connect: {
            id: appData.orgId,
          },
        },
        env: appData.env,
        secrets: JSON.stringify(appData.secrets),
      },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
      return json(409, res, {
        code: 409,
        message: "Subdomain must be unique.",
      });
    }
    return json(500, res, { code: 500, message: "Unable to create app." });
  }

  try {
    await createDeployment(
      app.orgId,
      app.id,
      latestCommit.sha,
      latestCommit.commit.message,
      repo.git_url,
    );
  } catch (e) {
    console.error(e);
    return json(500, res, {
      code: 500,
      message: "Failed to create a deployment for your app.",
    });
  }

  return json(200, res, { id: app.id });
};

export default createApp;
