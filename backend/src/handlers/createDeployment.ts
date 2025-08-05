import type { DeploymentConfigCreateInput } from "../generated/prisma/models.ts";
import { db } from "../lib/db.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import { buildAndDeploy } from "./githubWebhook.ts";
import type { AuthenticatedRequest } from "./index.ts";
import { withSensitiveEnv } from "./updateApp.ts";

export const createDeployment: HandlerMap["createDeployment"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appConfig = ctx.request.requestBody;

  const app = await db.app.findUnique({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: {
      deploymentConfigTemplate: true,
      org: { select: { githubInstallationId: true } },
    },
  });

  if (!app) {
    return json(404, res, {});
  }

  const deploymentConfig: DeploymentConfigCreateInput = {
    // Null values for unchanged sensitive vars need to be replaced with their true values
    env: withSensitiveEnv(
      app.deploymentConfigTemplate.getPlaintextEnv(),
      appConfig.env,
    ),
    fieldValues: {
      replicas: appConfig.replicas,
      port: appConfig.port,
      servicePort: 80,
      mounts: appConfig.mounts,
      extra: {
        postStart: appConfig.postStart,
        preStop: appConfig.preStop,
      },
    },
    ...(appConfig.source === "git"
      ? {
          source: "GIT",
          branch: appConfig.branch,
          repositoryId: appConfig.repositoryId,
          builder: appConfig.builder,
          rootDir: appConfig.rootDir,
          dockerfilePath: appConfig.dockerfilePath,
          event: appConfig.event,
          eventId: appConfig.eventId,
        }
      : {
          source: "IMAGE",
          imageTag: appConfig.imageTag,
        }),
  };

  let commitSha = "",
    commitMessage = "Manual deployment";

  if (appConfig.source === "git") {
    if (!deploymentConfig.repositoryId) {
      return json(400, res, {});
    }
    // Fetch the latest commit and use that.
    // If the user wants to deploy from a previous version of their app, the UI will have them set the source to OCI Image instead.
    // TODO: Allow users to rebuild a previous commit as part of a redeploy. Intermittent issues might prevent a build
    //       from succeeding the first time, so you should be able to retry it in its entirety. Maybe it should even be the default?
    const octokit = await getOctokit(app.org.githubInstallationId);
    const repo = await getRepoById(octokit, deploymentConfig.repositoryId);
    const latestCommit = (
      await octokit.rest.repos.listCommits({
        per_page: 1,
        owner: repo.owner.login,
        repo: repo.name,
        sha: appConfig.branch,
      })
    ).data[0];

    commitSha = latestCommit.sha;
    commitMessage = latestCommit.commit.message;
  }

  await buildAndDeploy({
    appId: app.id,
    orgId: app.orgId,
    config: deploymentConfig,
    imageRepo: app.imageRepo,
    createCheckRun: false,
    commitSha,
    commitMessage,
  });

  await db.app.update({
    where: { id: ctx.request.params.appId },
    data: {
      enableCD: appConfig.enableCD,
      isPreviewing: true,
    },
  });

  return json(201, res, {});
};
