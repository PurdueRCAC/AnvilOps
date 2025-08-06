import { dequeueBuildJob } from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { db } from "../lib/db.ts";
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
      config: true,
      app: {
        select: {
          name: true,
          logIngestSecret: true,
          subdomain: true,
          org: { select: { githubInstallationId: true } },
          projectId: true,
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
      const repo = await getRepoById(octokit, deployment.config.repositoryId);

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
      include: { appGroup: true },
    });

    const { namespace, configs, postCreate } =
      createAppConfigsFromDeployment(deployment);
    try {
      const api = getClientForClusterUsername(
        app.clusterUsername,
        "KubernetesObjectApi",
        shouldImpersonate(app.projectId),
      );

      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
      log(deployment.id, "BUILD", "Deployment succeeded");

      // Update statuses - this should be the only complete deployment
      await Promise.all([
        db.deployment.update({
          where: { id: deployment.id },
          data: { status: "COMPLETE" },
        }),
        db.deployment.updateMany({
          where: {
            id: { not: deployment.id },
            appId: app.id,
            status: "COMPLETE",
          },
          data: { status: "STOPPED" },
        }),
        // The update was successful. Update App with the reference to the latest successful config.
        db.app.update({
          where: { id: deployment.appId },
          data: { configId: deployment.configId },
        }),
      ]);

      dequeueBuildJob(); // TODO - error handling for this line
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
