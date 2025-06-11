import { db } from "../lib/db.ts";
import {
  createDeploymentConfig,
  createOrUpdateApp,
  createServiceConfig,
} from "../lib/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { type Env, type HandlerMap, json, type Secrets } from "../types.ts";

export const updateDeployment: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } = ctx.request.requestBody;

  if (!secret) {
    return json(401, res, {});
  }

  if (!(status in ["BUILDING", "DEPLOYING", "ERROR"]))
    return json(400, res, {});

  const deployment = await db.deployment.update({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" | "ERROR" },
    include: {
      app: { include: { org: { select: { githubInstallationId: true } } } },
    },
  });

  if (!deployment) {
    return json(403, res, {});
  }

  if (status === "DEPLOYING" || status === "ERROR") {
    // The build completed. Update the check run with the result of the build (success or failure).
    const octokit = await getOctokit(deployment.app.org.githubInstallationId);

    // Get the repo's name and owner from its ID, just in case the name or owner changed in the middle of the deployment
    const repo = await getRepoById(octokit, deployment.app.repositoryId);

    await octokit.rest.checks.update({
      check_run_id: deployment.checkRunId,
      status: "completed",
      conclusion: status === "DEPLOYING" ? "success" : "failure",
      owner: repo.owner.login,
      repo: repo.name,
    });
  }

  if (status === "DEPLOYING") {
    const app = await db.app.findUnique({
      where: {
        id: deployment.appId,
      },
    });

    const subdomain = app.subdomain;
    const appParams = {
      name: app.name,
      namespace: subdomain,
      image: deployment.imageTag,
      env: app.env as Env,
      secrets: JSON.parse(app.secrets) as Secrets[],
      port: app.port,
      replicas: app.replicas,
    };
    const deployConfig = createDeploymentConfig(appParams);
    const svcConfig = createServiceConfig(appParams, subdomain);
    try {
      await createOrUpdateApp(
        subdomain,
        deployConfig,
        svcConfig,
        JSON.parse(app.secrets) as Secrets[],
      );
    } catch (err) {
      console.error(err);
      await db.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "ERROR",
        },
      });
    }
  }

  return json(200, res, {});
};
