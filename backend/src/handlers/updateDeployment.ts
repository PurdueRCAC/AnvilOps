import { db } from "../db/index.ts";
import { dequeueBuildJob } from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { json, type HandlerMap } from "../types.ts";
import { log } from "./githubWebhook.ts";

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
    return json(400, res, { code: 400, message: "Invalid status." });
  }
  const deployment = await db.deployment.getFromSecret(secret);

  if (!deployment) {
    return json(404, res, { code: 404, message: "Deployment not found." });
  }

  const config = await db.deployment.getConfig(deployment.id);
  if (config.source !== "GIT") {
    return json(400, res, { code: 400, message: "Cannot update deployment" });
  }

  await db.deployment.setStatus(
    deployment.id,
    status as "BUILDING" | "DEPLOYING" | "ERROR",
  );

  log(
    deployment.id,
    "BUILD",
    "Deployment status has been updated to " + status,
  );

  const app = await db.app.getById(deployment.appId);
  const [appGroup, org] = await Promise.all([
    db.appGroup.getById(app.appGroupId),
    db.org.getById(app.orgId),
  ]);

  if (
    (status === "DEPLOYING" || status === "ERROR") &&
    deployment.checkRunId !== null
  ) {
    try {
      // The build completed. Update the check run with the result of the build (success or failure).
      const octokit = await getOctokit(org.githubInstallationId);

      // Get the repo's name and owner from its ID, just in case the name or owner changed in the middle of the deployment
      const repo = await getRepoById(octokit, config.repositoryId);

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
    const { namespace, configs, postCreate } =
      await createAppConfigsFromDeployment(
        org,
        app,
        appGroup,
        deployment,
        config,
      );

    try {
      const api = getClientForClusterUsername(
        app.clusterUsername,
        "KubernetesObjectApi",
        shouldImpersonate(app.projectId),
      );

      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
      log(deployment.id, "BUILD", "Deployment succeeded");

      await Promise.all([
        db.deployment.setStatus(deployment.id, "COMPLETE"),
        // The update was successful. Update App with the reference to the latest successful config.
        db.app.setConfig(app.id, config.id),
      ]);

      dequeueBuildJob(); // TODO - error handling for this line
    } catch (err) {
      console.error(err);
      await db.deployment.setStatus(deployment.id, "ERROR");
      await log(
        deployment.id,
        "BUILD",
        `Failed to apply Kubernetes resources: ${JSON.stringify(err?.body ?? err)}`,
        "stderr",
      );
    }
  }

  return json(200, res, undefined);
};
