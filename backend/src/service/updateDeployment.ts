import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { dequeueBuildJob } from "../lib/builder.ts";
import {
  createOrUpdateApp,
  getClientForClusterUsername,
} from "../lib/cluster/kubernetes.ts";
import { shouldImpersonate } from "../lib/cluster/rancher.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { getGitProvider } from "../lib/git/gitProvider.ts";
import { logger } from "../logger.ts";
import { DeploymentNotFoundError, ValidationError } from "./errors/index.ts";
import { log } from "./githubWebhook.ts";

export class UpdateDeploymentService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
  }

  async updateDeployment(secret: string, newStatus: string) {
    if (!secret) {
      throw new ValidationError("No deployment secret provided.");
    }
    const deployment = await this.deploymentRepo.getFromSecret(secret);

    if (!deployment) {
      throw new DeploymentNotFoundError();
    }

    const config = await this.deploymentRepo.getConfig(deployment.id);
    if (config.source === "IMAGE") {
      throw new ValidationError("Cannot update deployment");
    }

    switch (config.source) {
      case "GIT": {
        if (
          !["BUILDING", "DEPLOYING", "ERROR"].some((it) => newStatus === it)
        ) {
          throw new ValidationError("Invalid status.");
        }
        break;
      }
      case "HELM": {
        if (
          !["DEPLOYING", "COMPLETE", "ERROR"].some((it) => newStatus === it)
        ) {
          throw new ValidationError("Invalid status.");
        }
        break;
      }
      default: {
        throw new ValidationError("Invalid source.");
      }
    }

    await this.deploymentRepo.setStatus(
      deployment.id,
      newStatus as "BUILDING" | "DEPLOYING" | "COMPLETE" | "ERROR",
    );

    log(
      this.deploymentRepo,
      deployment.id,
      "BUILD",
      "Deployment status has been updated to " + newStatus,
    );
    logger.info(
      { deploymentId: deployment.id, newStatus },
      "Updated deployment status via /api/deployment/update",
    );

    if (config.source != "GIT") {
      return;
    }

    const app = await this.appRepo.getById(deployment.appId);
    const [appGroup, org] = await Promise.all([
      this.appGroupRepo.getById(app.appGroupId),
      this.orgRepo.getById(app.orgId),
    ]);

    if (
      (newStatus === "DEPLOYING" || newStatus === "ERROR") &&
      deployment.checkRunId !== null
    ) {
      try {
        // The build completed. Update the check run with the result of the build (success or failure).
        const gitProvider = await getGitProvider(org.id);

        await gitProvider.updateCheckStatus(
          config.repositoryId,
          deployment.checkRunId,
          newStatus === "DEPLOYING" ? "success" : "failure",
        );

        log(
          this.deploymentRepo,
          deployment.id,
          "BUILD",
          "Updated GitHub check run to Completed with conclusion " +
            (newStatus === "DEPLOYING" ? "Success" : "Failure"),
        );
      } catch (e) {
        logger.error(e, "Failed to update check run");
      }
    }

    if (newStatus === "DEPLOYING") {
      const { namespace, configs, postCreate } =
        await createAppConfigsFromDeployment({
          org,
          app,
          appGroup,
          deployment,
          config,
        });

      try {
        const api = getClientForClusterUsername(
          app.clusterUsername,
          "KubernetesObjectApi",
          shouldImpersonate(app.projectId),
        );

        await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
        log(
          this.deploymentRepo,
          deployment.id,
          "BUILD",
          "Deployment succeeded",
        );

        await Promise.all([
          this.deploymentRepo.setStatus(deployment.id, "COMPLETE"),
          // The update was successful. Update App with the reference to the latest successful config.
          this.appRepo.setConfig(app.id, deployment.configId),
        ]);
      } catch (err) {
        logger.error(err, "Failed to apply Kubernetes resources");
        await this.deploymentRepo.setStatus(deployment.id, "ERROR");

        log(
          this.deploymentRepo,
          deployment.id,
          "BUILD",
          `Failed to apply Kubernetes resources: ${JSON.stringify(err)}`,
          "stderr",
        );
      }

      try {
        await dequeueBuildJob();
      } catch (e) {
        logger.error(e, "Failed to dequeue next build job");
      }
    }
  }
}
