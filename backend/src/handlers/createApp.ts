import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { randomBytes } from "node:crypto";
import type { Octokit } from "octokit";
import { type App } from "../generated/prisma/client.ts";
import { type AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, redirect, type Env, type HandlerMap } from "../types.ts";
import { createState } from "./githubAppInstall.ts";
import {
  buildAndDeploy,
  generateCloneURLWithCredentials,
} from "./githubWebhook.ts";
import { NAMESPACE_PREFIX } from "../lib/kubernetes.ts";
import { components, operations } from "../generated/openapi.ts";

export const validateEnv = (
  env: Env[] | undefined,
  secrets: Env[] | undefined,
) => {
  const envNames = new Set();
  env = env ?? [];
  secrets = secrets ?? [];
  for (let envVar of [...env, ...secrets]) {
    if (envNames.has(envVar.name)) {
      throw new Error("Duplicate environment variable: " + envVar);
    }
    envNames.add(envVar.name);
  }
};

const createApp: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;

  try {
    validateAppConfig(appData);
  } catch (err) {
    return json(400, res, {
      code: 400,
      message: err.message,
    });
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
        displayName: appData.name,
        repositoryId: appData.repositoryId,
        subdomain: appData.subdomain,
        org: {
          connect: {
            id: appData.orgId,
          },
        },
        repositoryBranch: appData.branch,
        logIngestSecret: randomBytes(48).toString("hex"),
      },
    });
    app = await db.app.update({
      where: { id: app.id },
      data: { imageRepo: `app-${app.orgId}-${app.id}` },
    });
  } catch (err) {
    if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
      // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
      return json(409, res, {
        code: 409,
        message: "Subdomain must be unique.",
      });
    }
    console.error(err);
    return json(500, res, { code: 500, message: "Unable to create app." });
  }

  // TODO: Check if env vars from storage have been duplicated
  // TODO: Validate storage image - check if supported

  try {
    await buildAndDeploy({
      orgId: app.orgId,
      appId: app.id,
      imageRepo: app.imageRepo,
      commitSha: latestCommit.sha,
      commitMessage: latestCommit.commit.message,
      cloneURL: await generateCloneURLWithCredentials(octokit, repo.html_url),
      config: {
        port: appData.port,
        env: appData.env,
        secrets: appData.secrets ? JSON.stringify(appData.secrets) : undefined,
        builder: appData.builder,
        dockerfilePath: appData.dockerfilePath,
        rootDir: appData.rootDir,
      },
      storageConfig: appData.storage,
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

const validateAppConfig = (
  appData: operations["createApp"]["requestBody"]["content"]["application/json"],
) => {
  if (appData.rootDir.startsWith("/") || appData.rootDir.includes(`"`)) {
    throw new Error("Invalid root directory");
  }

  if (appData.env?.some((it) => !it.name || it.name.length === 0)) {
    throw new Error("Some environment variables are empty");
  }

  if (appData.port < 0 || appData.port > 65535) {
    throw new Error("Invalid port number");
  }

  if (appData.dockerfilePath) {
    if (
      appData.dockerfilePath.startsWith("/") ||
      appData.dockerfilePath.includes(`"`)
    ) {
      throw new Error("Invalid Dockerfile path");
    }
  }

  if (appData.storage) {
    if (!appData.storage.image.includes(":")) {
      throw new Error("Invalid image (Must be in the format repository:tag)");
    }

    if (appData.storage.amount <= 0 || appData.storage.amount > 10) {
      throw new Error(
        "Invalid storage capacity (Must be a positive value less than 10",
      );
    }
    if (appData.storage.port < 0 || appData.storage.port > 65535) {
      throw new Error("Invalid port number");
    }
  }

  const MAX_NS_LENGTH = 63 - NAMESPACE_PREFIX.length;
  if (
    appData.subdomain.length > MAX_NS_LENGTH ||
    appData.subdomain.match(/^[a-zA-Z0-9-]+$/) == null
  ) {
    throw new Error("Invalid subdomain");
  }

  validateEnv(appData.env, appData.secrets);
  if (appData.storage && appData.storage.env.length !== 0) {
    validateEnv(appData.storage.env, []);
  }
};
export default createApp;
