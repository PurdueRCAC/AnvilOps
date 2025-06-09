import { Context } from "openapi-backend";
import { components } from "../generated/openapi.ts";
import { HandlerMap, redirect } from "../types.ts";
import { type Response as ExpressResponse } from "express";
import { json } from "../types.ts";
import { db } from "../lib/db.ts";
import { createState } from "./githubAppInstall.ts";
import { Octokit } from "octokit";
import { randomBytes } from "node:crypto";
import { createBuildJob } from "../lib/builder.ts";
import { AuthenticatedRequest } from "../lib/api.ts";

export const createApp: HandlerMap["createApp"] = async (
  ctx: Context<{
    content: { "application/json": components["schemas"]["NewApp"] };
  }>,
  req: AuthenticatedRequest,
  res: ExpressResponse,
) => {
  const appData = ctx.request.requestBody.content["application/json"];
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

  let repoId: number;
  let commitHash: string;
  let commitMessage: string;
  try {
    let res = await getDeploymentInfo(appData.repositoryURL);
    repoId = res.repoId;
    commitHash = res.commitHash;
    commitMessage = res.commitMessage;
  } catch (e) {
    return json(500, res, { code: 500, message: "Bad repository URL" });
  }

  const app = await db.app.create({
    data: {
      name: appData.name,
      repositoryURL: appData.repositoryURL,
      repositoryId: repoId,
      port: appData.port,
      dockerfilePath: appData.dockerfilePath,
      subdomain: appData.subdomain,
      org: {
        connect: {
          id: appData.orgId,
        },
      },
      webhookSecret: "", // TODO
      env: appData.env,
      secrets: appData.secrets,
    },
  });
  // build image
  const imageTag =
    `registry.anvil.rcac.purdue.edu/anvilops/app-${app.orgId}-${app.id}:${commitHash}` as const;
  const secret = randomBytes(32).toString("hex");
  const deployment = await db.deployment.create({
    data: {
      appId: app.id,
      commitHash,
      commitMessage,
      imageTag: imageTag,
      secret: secret,
    },
  });

  const jobId = await createBuildJob(
    "dockerfile",
    appData.repositoryURL,
    imageTag,
    `registry.anvil.rcac.purdue.edu/anvilops/app-${app.orgId}-${app.id}:build-cache`,
    secret,
  );

  await db.deployment.update({
    where: { id: deployment.id },
    data: { builderJobId: jobId },
  });

  return json(200, res, {});
};

const getDeploymentInfo = async (repoURL: string) => {
  const { pathname } = new URL(repoURL);
  const [, owner, repo] = pathname.split("/");
  if (!owner || !repo) {
    throw new Error(
      "URL must be of the form https://github.com/<owner>/<repo>",
    );
  }
  const octokit = new Octokit();
  const res = await octokit.rest.repos.get({ owner, repo });
  const repoId = res.data.id;

  const branch = res.data.default_branch;

  const commitRes = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: branch,
    per_page: 1,
  });

  return {
    repoId,
    commitHash: commitRes.data[0].sha,
    commitMessage: commitRes.data[0].commit.message,
  };
};
