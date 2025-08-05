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
    return json(400, res, { message: "Repository ID not specified" });
  }

  // Look up the connected app and create a deployment job
  const apps = await db.app.findMany({
    where: {
      deploymentConfigTemplate: {
        source: DeploymentSource.GIT,
        repositoryId: repoId,
      },
      org: { githubInstallationId: { not: null } },
      enableCD: true,
    },
    include: {
      org: { select: { githubInstallationId: true } },
      deploymentConfigTemplate: true,
    },
  });

  if (apps.length === 0) {
    return json(200, res, { message: "No matching apps found" });
  }

  for (const app of apps) {
    // Require that the app deploys on push and the push was made to the right branch
    if (
      app.deploymentConfigTemplate.event !== "push" ||
      payload.ref !== `refs/heads/${app.deploymentConfigTemplate.branch}`
    ) {
      continue;
    }

    const octokit = await getOctokit(app.org.githubInstallationId);

    delete app.deploymentConfigTemplate.id; // When creating a new Deployment, we also want to create a new DeploymentConfig that isn't related at all to the template
    await buildAndDeploy({
      orgId: app.orgId,
      appId: app.id,
      imageRepo: app.imageRepo,
      commitSha: payload.head_commit.id,
      commitMessage: payload.head_commit.message,
      config: {
        // Reuse the config from the previous deployment
        fieldValues: app.deploymentConfigTemplate.fieldValues,
        source: "GIT",
        event: app.deploymentConfigTemplate.event,
        env: app.deploymentConfigTemplate.getPlaintextEnv(),
        repositoryId: app.deploymentConfigTemplate.repositoryId,
        branch: app.deploymentConfigTemplate.branch,
        builder: app.deploymentConfigTemplate.builder,
        rootDir: app.deploymentConfigTemplate.rootDir,
        dockerfilePath: app.deploymentConfigTemplate.dockerfilePath,
        imageTag: app.deploymentConfigTemplate.imageTag,
      },
      createCheckRun: true,
      octokit,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    });
  }

  return json(200, res, {});
};
