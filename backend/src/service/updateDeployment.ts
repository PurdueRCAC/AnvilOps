import type { Deployment, DeploymentConfig } from "../db/models.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import { logger } from "../logger.ts";
import type { DeploymentService } from "./common/deployment.ts";
import type { GitProviderFactoryService } from "./common/git/gitProvider.ts";
import { DeploymentNotFoundError, ValidationError } from "./errors/index.ts";
import { log } from "./githubWebhook.ts";

export class UpdateDeploymentService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private deploymentRepo: DeploymentRepo;
  private gitProviderFactoryService: GitProviderFactoryService;
  private deploymentService: DeploymentService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    deploymentRepo: DeploymentRepo,
    gitProviderFactoryService: GitProviderFactoryService,
    deploymentService: DeploymentService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.deploymentRepo = deploymentRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.deploymentService = deploymentService;
  }

  async updateDeploymentFromSecret(secret: string, newStatus: string) {
    if (!secret) {
      throw new ValidationError("No deployment secret provided.");
    }
    const deployment = await this.deploymentRepo.getFromSecret(secret);

    if (!deployment) {
      throw new DeploymentNotFoundError();
    }

    return await this.updateDeployment(deployment, newStatus);
  }

  private validateNewStatus(config: DeploymentConfig, newStatus: string) {
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
  }

  async updateDeployment(deployment: Deployment, newStatus: string) {
    const config = await this.deploymentRepo.getConfig(deployment.id);
    if (config.source === "IMAGE") {
      throw new ValidationError("Cannot update deployment");
    }

    this.validateNewStatus(config, newStatus);

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

    if (config.source === "HELM") {
      if (newStatus === "COMPLETE") {
        await this.appRepo.setConfig(deployment.appId, deployment.configId);
      }
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
        const gitProvider = await this.gitProviderFactoryService.getGitProvider(
          org.id,
        );

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
      await this.deploymentService.finishDeployment(
        org,
        app,
        appGroup,
        deployment,
        config,
      );
    }
  }
}
