import { db } from "../lib/db.ts";
import {
  createAppConfigs,
  createOrUpdateApp,
  getNamespace,
  type AppParams,
} from "../lib/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type Env, type HandlerMap } from "../types.ts";

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
      config: { include: { mounts: true } },
      app: {
        select: {
          org: { select: { githubInstallationId: true } },
        },
        include: { deploymentConfigTemplate: true },
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
      const repo = await getRepoById(
        octokit,
        deployment.app.deploymentConfigTemplate.repositoryId,
      );

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
      include: {
        deployments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 2,
        },
      },
    });

    const appParams: AppParams = {
      deploymentId: deployment.id,
      appId: app.id,
      name: app.name,
      namespace: getNamespace(app.subdomain),
      image: deployment.imageTag,
      env: deployment.config.env as Env[],
      secrets: (deployment.config.secrets
        ? JSON.parse(deployment.config.secrets)
        : []) as Env[],
      port: deployment.config.port,
      replicas: deployment.config.replicas,
      loggingIngestSecret: app.logIngestSecret,
      mounts: deployment.config.mounts,
    };
    const { namespace, configs } = createAppConfigs(appParams);
    try {
      await createOrUpdateApp(app.name, namespace, configs);
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: "COMPLETE" },
      });
      if (app.deployments.length === 2) {
        await db.deployment.update({
          where: { id: app.deployments[1].id },
          data: { status: "STOPPED" },
        });
      }
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
