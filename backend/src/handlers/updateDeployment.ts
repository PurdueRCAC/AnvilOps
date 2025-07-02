import { dequeueBuildJob } from "../lib/builder.ts";
import { db } from "../lib/db.ts";
import {
  createAppConfigsFromDeployment,
  createOrUpdateApp,
} from "../lib/kubernetes.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import { log } from "./githubWebhook.ts";
import { notifyLogStream } from "./ingestLogs.ts";

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
          name: true,
          logIngestSecret: true,
          subdomain: true,
          deploymentConfigTemplate: true,
          org: { select: { githubInstallationId: true } },
          appGroup: true,
        },
      },
    },
  });

  if (!deployment) {
    return json(403, res, {});
  }

  log(
    deployment.id,
    "BUILD",
    "Deployment status has been updated to " + status,
  );

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
      log(
        deployment.id,
        "BUILD",
        "Updated GitHub check run to Completed with conclusion " +
          (status === "DEPLOYING" ? "Success" : "Failure"),
      );
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

    const { namespace, configs, postCreate } =
      createAppConfigsFromDeployment(deployment);
    try {
      await db.app.update({
        where: {
          id: app.id,
        },
        data: {
          // Make future redeploys use this image tag since it's the most recent successful build
          deploymentConfigTemplate: {
            update: {
              imageTag: deployment.config.imageTag,
            },
          },
        },
      });

      await createOrUpdateApp(app.name, namespace, configs, postCreate);
      log(deployment.id, "BUILD", "Deployment succeeded");
      await db.deployment.update({
        where: { id: deployment.id },
        data: { status: "COMPLETE" },
      });
      if (app.deployments.length === 2) {
        // Update the status of the deployment before this one
        await db.deployment.update({
          where: { id: app.deployments[1].id },
          data: { status: "STOPPED" },
        });
      }

      dequeueBuildJob();
    } catch (err) {
      console.error(err);
      await db.deployment.update({
        where: {
          id: deployment.id,
        },
        data: {
          status: "ERROR",
          logs: {
            create: {
              timestamp: new Date(),
              content: {
                log: `Failed to apply Kubernetes resources: ${JSON.stringify(err?.body ?? err)}`,
              },
              type: "BUILD",
            },
          },
        },
      });
      await notifyLogStream(deployment.id);
    }
  }

  return json(200, res, {});
};
