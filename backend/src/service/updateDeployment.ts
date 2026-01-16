import { db } from "../db/index.ts";
import { dequeueBuildJob } from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { DeploymentNotFoundError, ValidationError } from "./common/errors.ts";
import { log } from "./githubWebhook.ts";

export async function updateDeployment(secret: string, newStatus: string) {
  if (!secret) {
    throw new ValidationError("No deployment secret provided.");
  }
  const deployment = await db.deployment.getFromSecret(secret);

  if (!deployment) {
    throw new DeploymentNotFoundError();
  }

  const config = await db.deployment.getConfig(deployment.id);
  if (config.source === "IMAGE") {
    throw new ValidationError("Cannot update deployment");
  }

  switch (config.source) {
    case "GIT": {
      if (!["BUILDING", "DEPLOYING", "ERROR"].some((it) => newStatus === it)) {
        throw new ValidationError("Invalid status.");
      }
      break;
    }
    case "HELM": {
      if (!["DEPLOYING", "COMPLETE", "ERROR"].some((it) => newStatus === it)) {
        throw new ValidationError("Invalid status.");
      }
      break;
    }
    default: {
      throw new ValidationError("Invalid source.");
    }
  }

  await db.deployment.setStatus(
    deployment.id,
    newStatus as "BUILDING" | "DEPLOYING" | "COMPLETE" | "ERROR",
  );

  log(
    deployment.id,
    "BUILD",
    "Deployment status has been updated to " + newStatus,
  );

  if (config.source != "GIT") {
    return;
  }

  const app = await db.app.getById(deployment.appId);
  const [appGroup, org] = await Promise.all([
    db.appGroup.getById(app.appGroupId),
    db.org.getById(app.orgId),
  ]);

  if (
    (newStatus === "DEPLOYING" || newStatus === "ERROR") &&
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
        conclusion: newStatus === "DEPLOYING" ? "success" : "failure",
        owner: repo.owner.login,
        repo: repo.name,
      });
      log(
        deployment.id,
        "BUILD",
        "Updated GitHub check run to Completed with conclusion " +
          (newStatus === "DEPLOYING" ? "Success" : "Failure"),
      );
    } catch (e) {
      console.error("Failed to update check run: ", e);
    }
  }

  if (newStatus === "DEPLOYING") {
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
        db.app.setConfig(app.id, deployment.configId),
      ]);

      await dequeueBuildJob();
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
}
