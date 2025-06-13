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

  if (!["BUILDING", "DEPLOYING", "ERROR"].some((it) => status === it)) {
    return json(400, res, {});
  }
  const deployment = await db.deployment.update({
    where: { secret: secret },
    data: { status: status as "BUILDING" | "DEPLOYING" | "ERROR" },
    include: {
      config: true,
      app: {
        select: {
          repositoryId: true,
          org: { select: { githubInstallationId: true } },
        },
      },
    },
  });

  if (!deployment) {
    return json(403, res, {});
  }

  if (
    (status === "DEPLOYING" || status === "ERROR") &&
    deployment.checkRunId !== null
  ) {
    try {
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
    } catch (e) {
      console.error("Failed to update check run: ", e);
    }
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
      env: deployment.config.env as Env,
      secrets: JSON.parse(deployment.config.secrets) as Secrets[],
      port: deployment.config.port,
      replicas: deployment.config.replicas,
    };
    const deployConfig = createDeploymentConfig(appParams);
    const svcConfig = createServiceConfig(appParams, subdomain);
    try {
      await createOrUpdateApp(
        subdomain,
        deployConfig,
        svcConfig,
        JSON.parse(deployment.config.secrets) as Secrets[],
      );
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: "COMPLETE" },
      });
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
