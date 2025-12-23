import { db } from "../../db/index.ts";
import { GitConfig } from "../../db/models.ts";
import { DeploymentRepo } from "../../db/repo/deployment.ts";
import type { components } from "../../generated/openapi.ts";
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
  const apps = await db.app.listFromConnectedRepo(
    repoId,
    "push",
    updatedBranch,
    undefined,
  );

  if (apps.length === 0) {
    return json(200, res, { message: "No matching apps found" });
  }

  for (const app of apps) {
    const org = await db.org.getById(app.orgId);
    const config = (await db.app.getDeploymentConfig(app.id)) as GitConfig;
    const octokit = await getOctokit(org.githubInstallationId);

    await buildAndDeploy({
      org: org,
      app: app,
      imageRepo: app.imageRepo,
      commitMessage: payload.head_commit.message,
      config: DeploymentRepo.cloneWorkloadConfig(config),
      createCheckRun: true,
      octokit,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    });
  }

  return json(200, res, {});
};
