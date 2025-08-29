import type { components } from "../../generated/openapi.ts";
import { DeploymentSource } from "../../generated/prisma/enums.ts";
import { db } from "../../lib/db.ts";
import { getOctokit } from "../../lib/octokit.ts";
import { json, type HandlerMap } from "../../types.ts";
import { buildAndDeploy } from "../githubWebhook.ts";

export const handlePush: HandlerMap["githubWebhook"] = async (
  ctx,
  req,
  res,
) => {
  const payload = ctx.request
    .requestBody as components["schemas"]["webhook-push"];

  const repoId = payload.repository?.id;
  if (!repoId) {
    return json(400, res, {
      code: 400,
      message: "Repository ID not specified",
    });
  }

  const updatedBranch = payload.ref.match(/^refs\/heads\/(?<branch>.+)/).groups
    .branch;

  // Look up the connected app and create a deployment job
  const apps = await db.app.findMany({
    where: {
      config: {
        source: DeploymentSource.GIT,
        event: "push",
        branch: updatedBranch,
        repositoryId: repoId,
      },
      org: { githubInstallationId: { not: null } },
      enableCD: true,
    },
    include: {
      org: { select: { githubInstallationId: true } },
      config: true,
    },
  });

  if (apps.length === 0) {
    return json(200, res, { message: "No matching apps found" });
  }

  for (const app of apps) {
    const octokit = await getOctokit(app.org.githubInstallationId);

    await buildAndDeploy({
      orgId: app.orgId,
      appId: app.id,
      imageRepo: app.imageRepo,
      commitMessage: payload.head_commit.message,
      config: {
        // Reuse the config from the previous deployment
        fieldValues: app.config.fieldValues,
        source: "GIT",
        event: app.config.event,
        env: app.config.getPlaintextEnv(),
        repositoryId: app.config.repositoryId,
        branch: app.config.branch,
        commitHash: payload.head_commit.id,
        builder: app.config.builder,
        rootDir: app.config.rootDir,
        dockerfilePath: app.config.dockerfilePath,
        imageTag: app.config.imageTag,
      },
      createCheckRun: true,
      octokit,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    });
  }

  return json(200, res, {});
};
